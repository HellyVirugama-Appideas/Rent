const router = require('express').Router();
const authController = require('../../controllers/admin/authController');

const userController = require('../../controllers/admin/userController');

router.get(
    '/',
    authController.checkPermission('user', 'isView'),
    userController.getAllUsers
);
// router.get('/:type/:id', userController.viewUser);
router.get('/change-status/:id/:status', userController.changeUserStatus);
router.get('/delete/:id', userController.getDeleteUser);

router.get('/retailer', userController.getEnquiries);
router.get('/chat/:id', userController.getChat);
router.post('/sendChat/:id', userController.sendChat);
router.get('/endChat/:id', userController.endChat);

module.exports = router;
