const express = require("express");
const nodemailer = require('nodemailer');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { signup, verifyEmail, login } = require("../controllers/userController");
const rateLimit = require('express-rate-limit');

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Rate limiting for email routes
const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: 'Too many email requests from this IP, please try again later'
});

// User Authentication Routes
router.post(
  "/signup",
  [ 
    body("name").isLength({ min: 3 }),
    body("email").isEmail(),
    body("password").isLength({ min: 6 }),
  ],
  signup
);

router.get("/verify/:token", verifyEmail);
router.post("/login", login);

// Order Confirmation Email Route
router.post(
  "/send-order-confirmation",
  emailLimiter,
  [
    body('userEmail').isEmail().normalizeEmail(),
    body('userName').notEmpty().trim().escape(),
    body('orderId').notEmpty(),
    body('orderItems').isArray({ min: 1 }),
    body('orderTotal').isFloat({ min: 0 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { 
      userEmail, 
      userName, 
      orderId, 
      orderItems, 
      orderTotal, 
      sellerEmail = "anassheik890@gmail.com"
    } = req.body;

    try {
       const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Order Confirmation #${orderId}</h2>
          <p>Hello ${userName},</p>
          <p>Thank you for your order! Here are your order details:</p>
          
          <h3 style="color: #333;">Order Summary</h3>
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
          <p><strong>Total:</strong> $${orderTotal}</p>
          
          <h4 style="color: #333;">Items Ordered:</h4>
          <ul>
            ${orderItems.map(item => `
              <li>${item.name} - ${item.quantity} × $${item.price}</li>
            `).join('')}
          </ul>
        </div>
      `;


      // Send order confirmation email
      await transporter.sendMail({
        from: `"${process.env.EMAIL_SENDER_NAME || 'Your Store'}" <${process.env.EMAIL_USER}>`,
        to: userEmail,
        subject: `Order Confirmation #${orderId}`,
        html: emailHtml
      });

      // Send to seller
      await transporter.sendMail({
        from: `"${process.env.EMAIL_SENDER_NAME}" <${process.env.EMAIL_USER}>`,
        to: sellerEmail,
        subject: `New Order Received #${orderId}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">New Order Notification</h2>
            <p>You have received a new order from ${userName} (${userEmail})</p>
            ${emailHtml}
          </div>
        `
      });

     res.status(200).json({ success: true });
    } catch (error) {
      console.error('Email error:', error);
      res.status(500).json({ 
        error: 'Failed to send email',
        details: error.message 
      });
    }
  }
);

module.exports = router;