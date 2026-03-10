// controllers/api/advertisementController.js
const stripe = require('../../config/stripe');
const Advertisement = require('../../models/advertisementModel');
const Product = require('../../models/product');
const AdminCommission = require('../../models/AdminCommission');
const createError = require('http-errors');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');
const userNotificationModel = require('../../models/userNotificationModel');

// ✅ dd/mm/yyyy formatter
const formatDate = (date) => {
    if (!date) return 'N/A';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

// Get advertisement pricing from admin settings
const getAdvertisementPricing = async () => {
    const settings = await AdminCommission.findOne({ isActive: true });
    // Default price per day if not set in admin
    return {
        pricePerDay: settings?.advertisementPricePerDay || 5.0, // AUD $5 per day
        minDays: 1,
        maxDays: 30,
    };
};

// Create advertisement payment intent
// exports.createAdvertisementPayment = async (req, res, next) => {
//     try {
//         const { productId, numberOfDays, startDate, title, description } =
//             req.body;
//         const sellerId = req.user.id;

//         // Validate inputs
//         if (!productId || !numberOfDays || !startDate) {
//             return next(
//                 createError.BadRequest(
//                     'Product ID, number of days, and start date are required.'
//                 )
//             );
//         }

//         // Verify product exists and belongs to seller
//         const product = await Product.findOne({
//             _id: productId,
//             user: sellerId,
//             isDeleted: false,
//         });

//         if (!product) {
//             return next(
//                 createError.NotFound(
//                     'Product not found or you do not have permission.'
//                 )
//             );
//         }

//         // Get pricing
//         const pricing = await getAdvertisementPricing();
//         const days = parseInt(numberOfDays);

//         if (days < pricing.minDays || days > pricing.maxDays) {
//             return next(
//                 createError.BadRequest(
//                     `Number of days must be between ${pricing.minDays} and ${pricing.maxDays}.`
//                 )
//             );
//         }

//         // Calculate dates and amount
//         const start = new Date(startDate);
//         const end = new Date(start);
//         end.setDate(end.getDate() + days);

//         const totalAmount = pricing.pricePerDay * days;

//         // Check for overlapping advertisements for same product
//         const overlapping = await Advertisement.findOne({
//             product: productId,
//             status: { $in: ['pending', 'active'] },
//             paymentStatus: { $in: ['pending', 'paid'] },
//             $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
//         });

//         if (overlapping) {
//             return next(
//                 createError.BadRequest(
//                     'You already have an advertisement scheduled for this product during the selected dates.'
//                 )
//             );
//         }

//         // Handle image upload
//         let imageUrl = product.images[0]; // Default to product's first image
//         if (req.file) {
//             imageUrl = `/${req.file.filename}`;
//         }

//         // Create Stripe Payment Intent
//         const paymentIntent = await stripe.paymentIntents.create({
//             amount: Math.round(totalAmount * 100),
//             currency: 'aud',
//             metadata: {
//                 sellerId: sellerId,
//                 productId: productId,
//                 numberOfDays: days.toString(),
//                 advertisementType: 'product_promotion',
//             },
//             description: `Advertisement for ${product.title} - ${days} days`,
//             automatic_payment_methods: {
//                 enabled: true,
//             },
//         });

//         // Create advertisement record
//         const advertisement = await Advertisement.create({
//             seller: sellerId,
//             product: productId,
//             title: title || product.title,
//             description: description || product.description.substring(0, 200),
//             image: imageUrl,
//             numberOfDays: days,
//             startDate: start,
//             endDate: end,
//             pricePerDay: pricing.pricePerDay,
//             totalAmount,
//             stripePaymentIntentId: paymentIntent.id,
//             paymentStatus: 'pending',
//             status: 'pending',
//         });

//         res.status(200).json({
//             success: true,
//             clientSecret: paymentIntent.client_secret,
//             paymentIntentId: paymentIntent.id,
//             advertisementId: advertisement._id,
//             amount: totalAmount,
//             pricePerDay: pricing.pricePerDay,
//             numberOfDays: days,
//             startDate: start,
//             endDate: end,
//             message: `Advertisement payment: AUD $${totalAmount.toFixed(
//                 2
//             )} for ${days} days.`,
//         });
//     } catch (error) {
//         console.error('Error creating advertisement payment:', error);
//         next(error);
//     }
// };

exports.createAdvertisementPayment = async (req, res, next) => {
    try {
        const { productId, numberOfDays, startDate, endDate, title, description } = req.body;
        const sellerId = req.user.id;

        if (!productId || !startDate) {
            return next(createError.BadRequest('Product ID and start date are required.'));
        }

        if (!numberOfDays && !endDate) {
            return next(createError.BadRequest('Either numberOfDays or endDate is required.'));
        }

        const product = await Product.findOne({ _id: productId, user: sellerId, isDeleted: false });
        if (!product) return next(createError.NotFound('Product not found or you do not have permission.'));

        const pricing = await getAdvertisementPricing();

        // ✅ FIX: Parse date as UTC directly to avoid timezone shift
        // "2026-03-12" → split karo → UTC date banao — no timezone conversion
        const parseUTCDate = (dateStr) => {
            const [year, month, day] = String(dateStr).split('T')[0].split('-').map(Number);
            return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
        };

        const start = parseUTCDate(startDate);

        let end;
        let days;

        if (endDate) {
            end = parseUTCDate(endDate);
            const diffMs = end - start;
            days = Math.round(diffMs / (1000 * 60 * 60 * 24));
        } else {
            days = parseInt(numberOfDays);
            end = new Date(start);
            end.setUTCDate(end.getUTCDate() + days - 1); // ✅ inclusive end date
        }

        if (isNaN(days) || days < pricing.minDays || days > pricing.maxDays) {
            return next(createError.BadRequest(`Number of days must be between ${pricing.minDays} and ${pricing.maxDays}.`));
        }

        if (end <= start) {
            return next(createError.BadRequest('End date must be after start date.'));
        }

        const totalAmount = pricing.pricePerDay * days;

        const overlapping = await Advertisement.findOne({
            product: productId,
            status: { $in: ['pending', 'active'] },
            paymentStatus: { $in: ['pending', 'paid'] },
            $or: [{ startDate: { $lte: end }, endDate: { $gte: start } }],
        });

        if (overlapping) {
            return next(createError.BadRequest('You already have an advertisement scheduled for this product during the selected dates.'));
        }

        let imageUrl = product.images[0];
        if (req.file) imageUrl = `/${req.file.filename}`;

        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalAmount * 100),
            currency: 'aud',
            metadata: {
                sellerId,
                productId,
                numberOfDays: days.toString(),
                advertisementType: 'product_promotion',
            },
            description: `Advertisement for ${product.title} - ${days} days`,
            automatic_payment_methods: { enabled: true },
        });

        const advertisement = await Advertisement.create({
            seller: sellerId,
            product: productId,
            title: title || product.title,
            description: description || product.description.substring(0, 200),
            image: imageUrl,
            numberOfDays: days,
            startDate: start,
            endDate: end,
            pricePerDay: pricing.pricePerDay,
            totalAmount,
            stripePaymentIntentId: paymentIntent.id,
            paymentStatus: 'pending',
            status: 'pending',
        });

        res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            advertisementId: advertisement._id,
            amount: totalAmount,
            pricePerDay: pricing.pricePerDay,
            numberOfDays: days,
            startDate: start,
            endDate: end,
            message: `Advertisement payment: AUD $${totalAmount.toFixed(2)} for ${days} days.`,
        });
    } catch (error) {
        console.error('Error creating advertisement payment:', error);
        next(error);
    }
};

// Confirm advertisement payment
// exports.confirmAdvertisementPayment = async (req, res, next) => {
//     try {
//         const { paymentIntentId } = req.body;
//         const sellerId = req.user.id;

//         // Verify payment with Stripe
//         const paymentIntent = await stripe.paymentIntents.retrieve(
//             paymentIntentId
//         );

//         if (paymentIntent.status !== 'succeeded') {
//             return next(createError.BadRequest('Payment not completed.'));
//         }

//         // Find advertisement record
//         const advertisement = await Advertisement.findOne({
//             stripePaymentIntentId: paymentIntentId,
//         })
//             .populate('product', 'title images')
//             .populate('seller', 'name email fcmToken');

//         if (!advertisement) {
//             return next(
//                 createError.NotFound('Advertisement record not found.')
//             );
//         }

//         if (advertisement.seller._id.toString() !== sellerId) {
//             return next(createError.Forbidden('Unauthorized access.'));
//         }

//         // Update advertisement status
//         advertisement.paymentStatus = 'paid';
//         advertisement.paidAt = new Date();
//         advertisement.stripeChargeId = paymentIntent.latest_charge;
//         advertisement.approvalStatus = 'approved'; // Awaiting admin approval
//         await advertisement.save();

//         // Send notification to seller
//         if (advertisement.seller.fcmToken) {
//             await sendNotificationsToTokens(
//                 'Advertisement Payment Successful',
//                 `Your advertisement for ${advertisement.product.title
//                 } has been submitted. It will go live on ${advertisement.startDate.toLocaleDateString()}.`,
//                 [advertisement.seller.fcmToken]
//             );
//             await userNotificationModel.create({
//                 sentTo: [advertisement.seller._id],
//                 title: 'Advertisement Payment Successful',
//                 body: `Your advertisement payment of AUD $${advertisement.totalAmount.toFixed(
//                     2
//                 )} has been processed.`,
//             });
//         }

//         res.status(200).json({
//             success: true,
//             message: 'Advertisement payment confirmed successfully.',
//             advertisement,
//         });
//     } catch (error) {
//         console.error('Error confirming advertisement payment:', error);
//         next(error);
//     }
// };

// Confirm advertisement payment
exports.confirmAdvertisementPayment = async (req, res, next) => {
    try {
        const { paymentIntentId } = req.body;
        const sellerId = req.user.id;

        // Verify payment with Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentIntentId
        );

        if (paymentIntent.status !== 'succeeded') {
            return next(createError.BadRequest('Payment not completed.'));
        }

        // Find advertisement record
        const advertisement = await Advertisement.findOne({
            stripePaymentIntentId: paymentIntentId,
        })
            .populate('product', 'title images')
            .populate('seller', 'name email fcmToken');

        if (!advertisement) {
            return next(
                createError.NotFound('Advertisement record not found.')
            );
        }

        if (advertisement.seller._id.toString() !== sellerId) {
            return next(createError.Forbidden('Unauthorized access.'));
        }

        // Update payment details
        advertisement.paymentStatus = 'paid';
        advertisement.paidAt = new Date();
        advertisement.stripeChargeId = paymentIntent.latest_charge;
        advertisement.approvalStatus = 'approved';

        // ✅ FIX: Sync status based on current date/payment/approval
        advertisement.syncStatus();

        await advertisement.save();

        // Send notification to seller
        if (advertisement.seller.fcmToken) {
            // await sendNotificationsToTokens(
            //     'Advertisement Payment Successful',
            //     `Your advertisement for ${advertisement.product.title} has been submitted. It will go live on ${advertisement.startDate.toLocaleDateString()}.`,
            //     [advertisement.seller.fcmToken]
            // );]
             const goLiveDate = formatDate(advertisement.startDate);
            await sendNotificationsToTokens(
                'Advertisement Payment Successful',
                `Your advertisement for ${advertisement.product.title} has been submitted. It will go live on ${goLiveDate}.`,
                [advertisement.seller.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [advertisement.seller._id],
                title: 'Advertisement Payment Successful',
                body: `Your advertisement payment of AUD $${advertisement.totalAmount.toFixed(2)} has been processed.`,
            });
        }

        // ✅ FIX: Return virtuals (displayStatus, isRunning) in response
        res.status(200).json({
            success: true,
            message: 'Advertisement payment confirmed successfully.',
            advertisement: advertisement.toObject({ virtuals: true }),
        });
    } catch (error) {
        console.error('Error confirming advertisement payment:', error);
        next(error);
    }
};

// Get seller's advertisements
// exports.getMyAdvertisements = async (req, res, next) => {
//     try {
//         const sellerId = req.user.id;
//         const { status, page = 1, limit = 10 } = req.query;

//         const query = { seller: sellerId };
//         if (status) {
//             query.status = status;
//         }

//         const advertisements = await Advertisement.find(query)
//             .populate('product', 'title images price')
//             .sort('-createdAt')
//             .limit(limit * 1)
//             .skip((page - 1) * limit);

//         const total = await Advertisement.countDocuments(query);

//         // Check for expired advertisements and update status
//         for (const ad of advertisements) {
//             if (ad.checkExpiry()) {
//                 await ad.save();
//             }
//         }

//         res.status(200).json({
//             success: true,
//             data: advertisements,
//             pagination: {
//                 total,
//                 page: parseInt(page),
//                 limit: parseInt(limit),
//                 pages: Math.ceil(total / limit),
//             },
//         });
//     } catch (error) {
//         console.error('Error fetching advertisements:', error);
//         next(error);
//     }
// };

exports.getMyAdvertisements = async (req, res, next) => {
    try {
        const sellerId = req.user.id;
        const { status, page = 1, limit = 10 } = req.query;

        const query = { seller: sellerId };
        if (status) query.status = status;

        let ads = await Advertisement.find(query)
            .populate('product', 'title images price')
            .sort('-createdAt')
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit))
            .lean();

        // For response only – show correct status/displayStatus
        const responseData = ads.map(adData => {
            const tempAd = new Advertisement(adData);
            tempAd.syncStatus(); // updates in memory only
            return {
                ...adData,
                status: tempAd.status,          // show updated
                displayStatus: tempAd.displayStatus
            };
        });

        const total = await Advertisement.countDocuments(query);

        res.status(200).json({
            success: true,
            data: responseData,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / limit),
            },
        });

        // Optional: background update (fire-and-forget)
        // You can use process.nextTick or a queue
        process.nextTick(async () => {
            try {
                for (const adData of ads) {
                    const ad = await Advertisement.findById(adData._id);
                    if (ad) {
                        const changed = ad.syncStatus();
                        if (changed) await ad.save();
                    }
                }
            } catch (err) {
                console.error('Background status sync failed:', err);
            }
        });

    } catch (error) {
        console.error('Error fetching my advertisements:', error);
        next(error);
    }
};


// Get active advertisements (for displaying on home screen)
// exports.getActiveAdvertisements = async (req, res, next) => {
//     try {
//         const now = new Date();

//         const advertisements = await Advertisement.find({
//             status: 'active',
//             paymentStatus: 'paid',
//             approvalStatus: 'approved',
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//             isActive: true,
//         })
//             .populate('product', 'title images price avgRating')
//             .populate('seller', 'name')
//             .sort('-createdAt')
//             .limit(20);

//         res.status(200).json({
//             success: true,
//             data: advertisements,
//         });
//     } catch (error) {
//         console.error('Error fetching active advertisements:', error);
//         next(error);
//     }
// };

// exports.getActiveAdvertisements = async (req, res, next) => {
//     try {
//         const now = new Date();

//         let advertisements = await Advertisement.find({
//             status: 'active',
//             paymentStatus: 'paid',
//             approvalStatus: 'approved',
//             startDate: { $lte: now },
//             endDate: { $gte: now },
//             isActive: true,
//         })
//             .populate('product', 'title images price avgRating')
//             .populate('seller', 'name')
//             .sort('-createdAt')
//             .limit(20)
//             .lean();

//         // Just in case — add displayStatus
//         advertisements = advertisements.map(ad => {
//             const doc = new Advertisement(ad);
//             ad.displayStatus = doc.displayStatus;
//             return ad;
//         });

//         res.status(200).json({
//             success: true,
//             data: advertisements,
//         });
//     } catch (error) {
//         console.error('Error fetching active advertisements:', error);
//         next(error);
//     }
// };

exports.getActiveAdvertisements = async (req, res, next) => {
    try {
        const now = new Date();

        let ads = await Advertisement.find({
            status: 'active',
            paymentStatus: 'paid',
            approvalStatus: 'approved',
            startDate: { $lte: now },
            endDate: { $gte: now },
            isActive: true,
        })
            .populate('product', 'title images price avgRating')
            .populate('seller', 'name')
            .sort('-createdAt')
            .limit(20)
            .lean();

        ads = ads.map(adData => ({
            ...adData,
            displayStatus: new Advertisement(adData).displayStatus
        }));

        res.status(200).json({
            success: true,
            data: ads,
        });
    } catch (error) {
        console.error('Error fetching active advertisements:', error);
        next(error);
    }
};

// Cancel advertisement (before it starts)
exports.cancelAdvertisement = async (req, res, next) => {
    try {
        const { advertisementId, reason } = req.body;
        const sellerId = req.user.id;

        const advertisement = await Advertisement.findOne({
            _id: advertisementId,
            seller: sellerId,
        }).populate('seller', 'fcmToken');

        if (!advertisement) {
            return next(createError.NotFound('Advertisement not found.'));
        }

        // Can only cancel if not yet started
        const now = new Date();
        if (advertisement.startDate <= now) {
            return next(
                createError.BadRequest(
                    'Cannot cancel advertisement that has already started.'
                )
            );
        }

        // Process refund if payment was made
        let refundAmount = 0;
        if (
            advertisement.paymentStatus === 'paid' &&
            advertisement.stripeChargeId
        ) {
            try {
                const refund = await stripe.refunds.create({
                    charge: advertisement.stripeChargeId,
                    amount: Math.round(advertisement.totalAmount * 100),
                    reason: 'requested_by_customer',
                    metadata: {
                        advertisementId: advertisement._id.toString(),
                        reason: reason || 'Seller cancellation',
                    },
                });

                advertisement.refundAmount = advertisement.totalAmount;
                advertisement.stripeRefundId = refund.id;
                advertisement.refundedAt = new Date();
                advertisement.refundReason = reason || 'Seller cancellation';
                advertisement.paymentStatus = 'refunded';
                refundAmount = advertisement.totalAmount;
            } catch (refundError) {
                console.error('Refund error:', refundError);
                return next(
                    createError.BadRequest(
                        `Failed to process refund: ${refundError.message}`
                    )
                );
            }
        }

        advertisement.status = 'cancelled';
        await advertisement.save();

        // Send notification
        if (advertisement.seller.fcmToken) {
            await sendNotificationsToTokens(
                'Advertisement Cancelled',
                refundAmount > 0
                    ? `Your advertisement has been cancelled. Refund of AUD $${refundAmount.toFixed(
                        2
                    )} will be processed in 5-10 business days.`
                    : 'Your advertisement has been cancelled.',
                [advertisement.seller.fcmToken]
            );
        }

        res.status(200).json({
            success: true,
            message: 'Advertisement cancelled successfully.',
            refundAmount,
        });
    } catch (error) {
        console.error('Error cancelling advertisement:', error);
        next(error);
    }
};

// Get advertisement analytics
exports.getAdvertisementAnalytics = async (req, res, next) => {
    try {
        const { advertisementId } = req.params;
        const sellerId = req.user.id;

        const advertisement = await Advertisement.findOne({
            _id: advertisementId,
            seller: sellerId,
        }).populate('product', 'title images');

        if (!advertisement) {
            return next(createError.NotFound('Advertisement not found.'));
        }

        const clickThroughRate =
            advertisement.views > 0
                ? ((advertisement.clicks / advertisement.views) * 100).toFixed(
                    2
                )
                : 0;

        res.status(200).json({
            success: true,
            analytics: {
                views: advertisement.views,
                clicks: advertisement.clicks,
                clickThroughRate: `${clickThroughRate}%`,
                startDate: advertisement.startDate,
                endDate: advertisement.endDate,
                daysRemaining: Math.max(
                    0,
                    Math.ceil(
                        (advertisement.endDate - new Date()) /
                        (1000 * 60 * 60 * 24)
                    )
                ),
                totalAmount: advertisement.totalAmount,
                status: advertisement.status,
            },
            advertisement,
        });
    } catch (error) {
        console.error('Error fetching advertisement analytics:', error);
        next(error);
    }
};

// Get advertisement pricing info
exports.getAdvertisementPricing = async (req, res, next) => {
    try {
        const pricing = await getAdvertisementPricing();

        res.status(200).json({
            success: true,
            pricing: {
                pricePerDay: pricing.pricePerDay,
                currency: 'AUD',
                minDays: pricing.minDays,
                maxDays: pricing.maxDays,
                examples: [
                    {
                        days: 1,
                        price: pricing.pricePerDay * 1,
                    },
                    {
                        days: 3,
                        price: pricing.pricePerDay * 3,
                    },
                    {
                        days: 7,
                        price: pricing.pricePerDay * 7,
                    },
                    {
                        days: 30,
                        price: pricing.pricePerDay * 30,
                    },
                ],
            },
        });
    } catch (error) {
        console.error('Error fetching pricing:', error);
        next(error);
    }
};
