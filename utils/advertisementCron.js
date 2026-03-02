// utils/advertisementCron.js
const cron = require('node-cron');
const Advertisement = require('../models/advertisementModel');

const syncAdvertisementStatuses = async () => {
    try {
        console.log('🔄 Syncing advertisement statuses...');

        // Fetch all ads that are not in final state
        const advertisements = await Advertisement.find({
            status: { $nin: ['completed', 'cancelled', 'rejected'] },
            isActive: true,
        });

        let updatedCount = 0;

        for (const ad of advertisements) {
            const changed = ad.syncStatus();
            if (changed) {
                await ad.save();
                updatedCount++;
                console.log(`✅ Ad ${ad._id} status updated to: ${ad.status}`);
            }
        }

        console.log(`✅ Sync complete. ${updatedCount} ads updated.`);
    } catch (error) {
        console.error('❌ Error syncing advertisement statuses:', error);
    }
};

// Run every hour
cron.schedule('0 * * * *', syncAdvertisementStatuses);

// Also run once immediately when server starts
syncAdvertisementStatuses();

module.exports = { syncAdvertisementStatuses };