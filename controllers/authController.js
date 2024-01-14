const User = require('../models/users');
const catchAsyncErrors = require('../middlewares/catchAsyncErrors');
const ErrorHandler = require('../utils/errorHandler');
const sendToken = require('../utils/jwtToken');
const sendEmail = require('../utils/sendMail');
const crypto =  require('crypto');


// Register a new user  => /api/v1/user/register
exports.registerUser = catchAsyncErrors(async (req, res, next) => {
    const {name, email, password, role} = req.body;

    const user = await User.create({
        name, 
        email, 
        password, 
        role
    });
    
    sendToken(user, 200, res);

});

exports.loginUser = catchAsyncErrors(async (req, res, next) => {
    const { email, password} = req.body;

    // Check if email or password entered by the user
    if(!email || !password){
        return next(new ErrorHandler('Please enter email & password'), 400);
    }

    // Finding user in database
    const user = await User.findOne({email}).select('+password');

    if(!user){
        return next(new ErrorHandler('Invalid email or password.'), 401);
    }

    // Check if password is correct
    const isPasswordMatched = await user.comparePassword(password);

    if(!isPasswordMatched){
        return next(new ErrorHandler('Invalid email or password.'), 401);
    }

    sendToken(user, 200, res);
});

// Forgot Password => /api/v1/password/forgot
exports.forgotPassword = catchAsyncErrors( async(req, res, next) => {
    const user = await User.findOne({email:req.body.email});

    // Check user email in database
    if(!user){
        return next(new ErrorHandler('No user found with this email.'), 404);
    }

    // Get Reset Token
    const resetToken = user.getResetPasswordToken();

    await user.save({ validateBeforeSave : false});

    console.log(resetToken);    
    // Create reset password url
    const resetUrl =  `${req.protocol}://${req.get('host')}/api/v1/password/reset/${resetToken}`;

    const message = `Your password reset link is as follows : \n\n${resetUrl
    } \n\n If you have n't requested then please ignore.`

    try {
        await sendEmail({
            email : user.email,
            subject : 'Jobbee-API Password Recovery',
            message
        });
    
        res.status(200).json({
            succss : true,
            message : `Email sent successfully to: ${user.email}`
        });
    } catch (error) {

        console.log(error);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpire = undefined;

        await user.save({ validateBeforeSave : false});

        return next(new ErrorHandler('Email not sent'), 500);           
    }
});

// Reset Password => /api/v1/password/reset/:token
exports.resetPassword = catchAsyncErrors(async(req, res, next) => {
    // Hash url token
    const resetPasswordToken = crypto
        .createHash('sha256')
        .update(req.params.token)
        .digest('hex');

    const user = await User.findOne({
        resetPasswordToken,
        resetPasswordExpire:{$gt : Date.now()}
    });
    
    if(!user){
        return next(new ErrorHandler('Password reset token is invalid or has expired.', 400));
    }

    // Setup new password
    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    sendToken(user, 200, res);

});

// Logout user =>  /api/v1/logout
exports.logout = catchAsyncErrors( async(req, res, next) => {
    res.cookie('token', 'none', {
        expires : new Date(Date.now()),
        httpOnly : true
    });

    res.status(200).json({
        success : true,
        message : 'Logged out successfully.'
    });
});