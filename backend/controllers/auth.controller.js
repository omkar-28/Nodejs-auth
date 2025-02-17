import bcrypt from "bcryptjs";
import crypto from "crypto";

import { generateTokenAndSetCookie } from "../utils/generateTokenAndSetCookie.js";
import { User } from "../models/user.model.js"
import bcryptjs from "bcryptjs";
import { sendPasswordResetEmail, sendResetSuccessEmail, sendVerificationEmail, sendWelcomeEmail } from "../mailtrap/emails.js";

export const signup = async (req, res) => {
    const { email, password, name } = req.body;

    try {

        if (!email || !password || !name) {
            throw new Error("All fields are required");
        }

        const userAlreadyExists = await User.findOne({ email });
        console.log("userAlreadyExists", userAlreadyExists)

        if (userAlreadyExists) {
            return res.status(400).json({
                success: false,
                message: "Email already exists"
            })
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = Math.floor(100000 + Math.random() * 900000).toString();

        const newUser = new User({
            email,
            password: hashedPassword,
            name,
            verificationToken,
            verificationExpiredAt: Date.now() + 24 * 60 * 60 * 1000 // 24Hour
        });

        await newUser.save();

        //Jwt
        generateTokenAndSetCookie(res, newUser._id);

        await sendVerificationEmail(newUser.email, verificationToken);

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            user: {
                ...newUser._doc,
                password: undefined,
            }
        });

    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
}

export const verifyEmail = async (req, res) => {
    const { code } = req.body;

    try {
        const user = await User.findOne({
            verificationToken: code,
            verificationExpiredAt: { $gt: Date.now() }
        })

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "Invalid or missing verification token"
            });
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationExpiredAt = undefined;
        await user.save();

        await sendWelcomeEmail(user.email, user.name);

        res.status(200).json({
            success: true,
            message: "Email verification successful",
            user: {
                ...user._doc,
                password: undefined,
            }
        });

    } catch (error) {
        console.log('Error in email verification: ' + error)
        res.status(500).json({ success: false, message: "Error verifying email" });
    }
}

export const login = async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
        const isPassword = await bcryptjs.compare(password, user.password);
        if (!isPassword) {
            return res.status(400).json({
                success: false,
                message: "Incorrect password"
            });
        }

        generateTokenAndSetCookie(res, user._id);

        user.lastLogin = new Date();
        await user.save();

        res.status(200).json({
            success: true,
            message: "Login successful",
            user: {
                ...user._doc,
                password: undefined
            }
        });

    } catch (error) {
        console.log("Error in login: " + error);
        res.status(400).json({ success: false, message: error.message });
    }
}

export const logout = async (req, res) => {
    res.clearCookie("token");
    res.status(200).json({ success: true, message: "Logged out successfully" });
}

export const forgotPassword = async (req, res) => {
    const { email } = req.body;

    try {
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            });
        }

        //Generate reset token
        const resetToken = crypto.randomBytes(20).toString("hex");
        const resetTokenExpiredAt = Date.now() + 1 * 60 * 60 * 1000; //1 hour

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpiredAt = resetTokenExpiredAt;

        await user.save();

        // send email
        await sendPasswordResetEmail(user.email, `${process.env.CLIENT_URL}/reset-password/${resetToken}`)

        res.status(200).json({
            success: true,
            message: "Password reset email sent successfully"
        });

    } catch (error) {
        console.log("Error sending password: " + error);

        res.status(400).json({ success: false, message: error.message })
    }
}

export const resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpiredAt: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid or expired reset token"
            });
        }

        const hashedPassword = await bcryptjs.hash(password, 10);

        user.password = hashedPassword;
        user.resetPasswordToken = undefined;
        user.resetPasswordExpiredAt = undefined;

        await user.save();

        await sendResetSuccessEmail(user.email);

        res.status(200).json({
            success: true,
            message: "Password reset successful"
        });

    } catch (error) {
        console.log("Error in resetPassword: " + error)
        res.status(400).json({ success: false, message: error.message });
    }
}

export const checkAuth = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");
        if (!user) {
            return res.status(400).json({
                success: false,
                message: "User not found"
            });
        }

        res.status(200).json({ success: true, user });

    } catch (error) {
        console.log("Error in checkAuth: " + error);
        res.status(400).json({ success: false, message: error.message });
    }
}