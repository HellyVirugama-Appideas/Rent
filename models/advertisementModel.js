// // models/advertisementModel.js
// const mongoose = require('mongoose');

// const advertisementSchema = new mongoose.Schema(
//     {
//         seller: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: 'User',
//             required: true,
//         },
//         product: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: 'Product',
//             required: true,
//         },
//         // Advertisement details
//         title: {
//             type: String,
//             // required: true,
//             trim: true,
//         },
//         description: {
//             type: String,
//             trim: true,
//         },
//         image: {
//             type: String,
//             required: true,
//         },
//         // Duration and scheduling
//         numberOfDays: {
//             type: Number,
//             required: true,
//             min: 1,
//         },
//         startDate: {
//             type: Date,
//             required: true,
//         },
//         endDate: {
//             type: Date,
//             required: true,
//         },
//         // Pricing
//         pricePerDay: {
//             type: Number,
//             required: true,
//         },
//         totalAmount: {
//             type: Number,
//             required: true,
//         },
//         currency: {
//             type: String,
//             default: 'AUD',
//         },
//         // Stripe payment details
//         stripePaymentIntentId: {
//             type: String,
//             required: true,
//         },
//         stripeChargeId: {
//             type: String,
//         },
//         // Payment status
//         paymentStatus: {
//             type: String,
//             enum: ['pending', 'paid', 'failed', 'refunded'],
//             default: 'pending',
//         },
//         paidAt: {
//             type: Date,
//         },
//         // Advertisement status
//         status: {
//             type: String,
//             enum: ['pending', 'in-progress', 'active', 'completed', 'cancelled', 'rejected'],
//             default: 'pending',
//         },
//         // Admin approval
//         approvalStatus: {
//             type: String,
//             enum: ['pending', 'approved', 'rejected'],
//             default: 'approved',
//         },
//         // approvalReason: {
//         //     type: String,
//         // },
//         // approvalDate: {
//         //     type: Date,
//         // },
//         // approvedBy: {
//         //     type: mongoose.Schema.Types.ObjectId,
//         //     ref: 'admin',
//         // },
//         // Analytics
//         // views: {
//         //     type: Number,
//         //     default: 0,
//         // },
//         // clicks: {
//         //     type: Number,
//         //     default: 0,
//         // },
//         // Refund details
//         // refundAmount: {
//         //     type: Number,
//         //     default: 0,
//         // },
//         // stripeRefundId: {
//         //     type: String,
//         // },
//         // refundedAt: {
//         //     type: Date,
//         // },
//         // refundReason: {
//         //     type: String,
//         // },
//         // Additional metadata
//         metadata: {
//             type: Map,
//             of: String,
//         },
//         isActive: {
//             type: Boolean,
//             default: true,
//         },
//     },
//     { timestamps: true }
// );

// // Index for efficient queries
// advertisementSchema.index({ seller: 1, status: 1 });
// advertisementSchema.index({ startDate: 1, endDate: 1, status: 1 });
// advertisementSchema.index({ approvalStatus: 1 });

// // Virtual to check if advertisement is currently running
// advertisementSchema.virtual('isRunning').get(function () {
//     const now = new Date();
//     return (
//         this.status === 'active' &&
//         this.paymentStatus === 'paid' &&
//         this.startDate <= now &&
//         this.endDate >= now
//     );
// });

// // NEW: Frontend-friendly status
// advertisementSchema.virtual('displayStatus').get(function () {
//     const now = new Date();

//     if (this.status === 'cancelled') return 'cancelled';
//     if (this.status === 'rejected')   return 'rejected';
//     if (this.status === 'completed')  return 'completed';

//     if (this.paymentStatus === 'pending' || this.paymentStatus === 'failed') {
//         return 'pending payment';
//     }

//     if (this.approvalStatus === 'pending') {
//         return 'awaiting approval';
//     }

//     if (this.approvalStatus === 'rejected') {
//         return 'rejected';
//     }

//     // Payment done + approved
//     const oneDayBeforeStart = new Date(this.startDate);
//     oneDayBeforeStart.setDate(oneDayBeforeStart.getDate() - 1);

//     if (now < oneDayBeforeStart) {
//         return 'pending';  // Before the day prior to startDate
//     }

//     if (now >= oneDayBeforeStart && now < this.startDate) {
//         return 'in-progress';     // Exactly 1 day before startDate
//     }

//     if (now >= this.startDate && now <= this.endDate) {
//         return 'active';
//     }

//     // Should not reach here if cron is running, but fallback
//     return 'completed';
// });

// // Method to update real status (can be called manually or by cron)
// // Helper method to sync status
// advertisementSchema.methods.syncStatus = function () {
//     const now = new Date();
//     let changed = false;

//     if (this.paymentStatus !== 'paid' || this.approvalStatus !== 'approved') {
//         if (this.status !== 'pending') {
//             this.status = 'pending';
//             changed = true;
//         }
//     } else {
//         const oneDayBeforeStart = new Date(this.startDate);
//         oneDayBeforeStart.setDate(oneDayBeforeStart.getDate() - 1);

//         if (now < oneDayBeforeStart) {
//             if (this.status !== 'pending') {
//                 this.status = 'pending';
//                 changed = true;
//             }
//         } else if (now >= oneDayBeforeStart && now < this.startDate) {
//             if (this.status !== 'in-progress') {
//                 this.status = 'in-progress';
//                 changed = true;
//             }
//         } else if (now >= this.startDate && now <= this.endDate) {
//             if (this.status !== 'active') {
//                 this.status = 'active';
//                 changed = true;
//             }
//         } else {
//             if (this.status !== 'completed') {
//                 this.status = 'completed';
//                 changed = true;
//             }
//         }
//     }

//     return changed;
// };

// // Method to check if advertisement has expired
// advertisementSchema.methods.checkExpiry = function () {
//     const now = new Date();
//     if (this.status === 'active' && this.endDate < now) {
//         this.status = 'completed';
//         return true;
//     }
//     return false;
// };

// module.exports = mongoose.model('Advertisement', advertisementSchema);


const mongoose = require('mongoose');

const advertisementSchema = new mongoose.Schema(
    {
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        // Advertisement details
        title: {
            type: String,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        image: {
            type: String,
            required: true,
        },
        // Duration and scheduling
        numberOfDays: {
            type: Number,
            required: true,
            min: 1,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        // Pricing
        pricePerDay: {
            type: Number,
            required: true,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            default: 'AUD',
        },
        // Stripe payment details
        stripePaymentIntentId: {
            type: String,
            required: true,
        },
        stripeChargeId: {
            type: String,
        },
        // Payment status
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending',
        },
        paidAt: {
            type: Date,
        },
        // Advertisement status
        status: {
            type: String,
            enum: ['pending', 'in-progress', 'active', 'completed', 'cancelled', 'rejected'],
            default: 'pending',
        },
        // Admin approval
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'approved',
        },
        // Additional metadata
        metadata: {
            type: Map,
            of: String,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },   // ✅ virtuals included in JSON response
        toObject: { virtuals: true }, // ✅ virtuals included in toObject()
    }
);

// Index for efficient queries
advertisementSchema.index({ seller: 1, status: 1 });
advertisementSchema.index({ startDate: 1, endDate: 1, status: 1 });
advertisementSchema.index({ approvalStatus: 1 });

// Virtual to check if advertisement is currently running
advertisementSchema.virtual('isRunning').get(function () {
    const now = new Date();
    return (
        this.status === 'active' &&
        this.paymentStatus === 'paid' &&
        this.startDate <= now &&
        this.endDate >= now
    );
});

// Frontend-friendly status virtual
advertisementSchema.virtual('displayStatus').get(function () {
    if (this.status === 'cancelled') return 'cancelled';
    if (this.status === 'rejected')  return 'rejected';
    if (this.status === 'completed') return 'completed';

    if (this.paymentStatus === 'pending' || this.paymentStatus === 'failed') {
        return 'pending payment';
    }

    if (this.approvalStatus === 'pending') {
        return 'awaiting approval';
    }

    if (this.approvalStatus === 'rejected') {
        return 'rejected';
    }

    // paid + approved → check dates
    const now = new Date();

    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    const startUTC = new Date(this.startDate);
    startUTC.setUTCHours(0, 0, 0, 0);

    if (todayUTC < startUTC) {
        return 'pending';           // Future ad
    }

    if (todayUTC.getTime() === startUTC.getTime()) {
        return 'in-progress';       // Today is start date
    }

    if (todayUTC > startUTC && now <= this.endDate) {
        return 'active';            // Running after start day
    }

    return 'completed';             // Past end date
});

// Helper method to sync status
advertisementSchema.methods.syncStatus = function () {
    const now = new Date();
    let changed = false;

    if (this.paymentStatus !== 'paid' || this.approvalStatus !== 'approved') {
        if (this.status !== 'pending') {
            this.status = 'pending';
            changed = true;
        }
        return changed;
    }

    // Get today's date at midnight UTC for date-only comparison
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    const startUTC = new Date(this.startDate);
    startUTC.setUTCHours(0, 0, 0, 0);

    if (todayUTC < startUTC) {
        // Before start date → pending
        if (this.status !== 'pending') {
            this.status = 'pending';
            changed = true;
        }
    } else if (todayUTC.getTime() === startUTC.getTime()) {
        // Today IS the start date → in-progress
        if (this.status !== 'in-progress') {
            this.status = 'in-progress';
            changed = true;
        }
    } else if (todayUTC > startUTC && now <= this.endDate) {
        // After start date and before end → active
        if (this.status !== 'active') {
            this.status = 'active';
            changed = true;
        }
    } else {
        // Past end date → completed
        if (this.status !== 'completed') {
            this.status = 'completed';
            changed = true;
        }
    }

    return changed;
};

// Method to check if advertisement has expired
advertisementSchema.methods.checkExpiry = function () {
    const now = new Date();
    if (this.status === 'active' && this.endDate < now) {
        this.status = 'completed';
        return true;
    }
    return false;
};

module.exports = mongoose.model('Advertisement', advertisementSchema);