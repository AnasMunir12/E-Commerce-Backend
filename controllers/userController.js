const User = require("../models/User");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const { body, validationResult } = require("express-validator");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Signup
exports.signup = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }

  const { name, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Hash the password before saving it to the user object
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create a user object without saving it to the DB yet
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    // Create token (without the password) - do not include the password in the token
    const token = jwt.sign({ name, email }, process.env.JWT_SECRET, { expiresIn: "1h" });
    
    // Generate verification URL
    const verifyUrl = `${process.env.BASE_URL}/api/user/verify/${token}`;

    // Send verification email
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Verify your email",
      html: `
        <p>Hello ${name},</p>
        <p>Click below to verify your email:</p>
        <a href="${verifyUrl}">Verify Email</a>
        <p>Link valid for 1 hour.</p>
      `,
    });

    // Respond with success message
    res.status(201).json({ message: "Verification email sent" });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error during signup", error: err.message });
  }
};

// Email Verification
exports.verifyEmail = async (req, res) => {
  try {
    const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
    const user = await User.findOne({ email: decoded.email });

    if (!user) return res.status(400).send("Invalid token");
    if (user.isVerified) return res.status(400).send("Email already verified");

    user.isVerified = true;
    await user.save();

    res.send("Email verified successfully. You can now log in.");
  } catch (err) {
  console.error("Verification error:", err);
  if (err.name === "TokenExpiredError") {
    return res.status(400).send("Verification link has expired. Please sign up again.");
  }
  return res.status(400).send("Invalid or expired token.");
}
};


// Login
exports.login = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !user.isVerified) {
      return res.status(400).json({ message: "Invalid email or email not verified" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.status(200).json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email },
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Login failed", error: err.message });
  }
  
};
