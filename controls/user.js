require('dotenv').config()
const express = require('express')
const mongoose = require('mongoose')
const UserModel = mongoose.model('Users')
const router = express.Router()
const passport = require('passport');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');

require('../passport');

var transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_ID,
    pass: process.env.EMAIL_PASSWORD
  }
});

var mailOptions = {
  from: process.env.EMAIL_ID,
  subject: 'New Password from SITS',
};

router.put('/forgotpassword', async (req, res)=>{
  try {
      const newpassword = Math.random().toString(36).slice(3)
      const user = await UserModel.findOne({ email : req.body.email })
      if (!user) return res.status(400).send({ message: 'No User with that email' })
      mailOptions.text = 'Your new password is '+ newpassword
      mailOptions.to = user.email
      transporter.sendMail(mailOptions, function(error, info){
        if (error) {
          return res.status(500).send({ message: 'We could not send mail as of now : '+ error });
        }
        user.password = newpassword
        user.save()
        return res.status(200).send({ message: 'new password sent successfully' })
      });
    } catch (err) {
      return res.status(500).send({ message: 'server side error' })
    }
})

router.put('/resetpassword', passport.authenticate('jwt', { session: false }), async (req, res)=>{
  try {
      const user = await UserModel.findOne({ email : req.user.email })
      if (await user.isValidPassword(req.body.oldpassword)) {
        user.password = req.body.newpassword
        user.save()
        return res.status(200).send({ message: 'password changed successfully' })
      }
      return res.status(300).send({ message: 'wrong old password' });
    } catch (err) {
      res.status(500).send({ message: 'server side error' })
    }
})

router.put('/activate',(req, res)=>{
  try {
      const {token} = req.body
      jwt.verify(token, process.env.JWT_ACC_ACTIVATE,async function(err, decodedtoken){
        if(err) return res.status(400).send({message: 'incorrect link to activate account'})
        const { user } = decodedtoken
        const userfound = await UserModel.findOne({ email : user.email }).populate('role').exec();
        if(!userfound) return res.status(400).send({message: 'incorrect link to activate account'})
        if(userfound.active) return res.status(400).send({message: 'Already your account is activated'})
        await UserModel.findOneAndUpdate({ email : user.email }, {active: true});
        return res.status(200).send({... userfound._doc, token})
      })
    } catch (err) {
      res.status(500).send({ message: 'server side error' })
    }
})

router.get('/allusers', passport.authenticate('jwt', { session: false }), async (req, res)=>{
  try {
      const users = await UserModel.find({}).populate('role').exec();
      res.send(users);
    } catch (err) {
      res.status(500).send({ message: 'server side error' })
    }
})

router.put('/user', passport.authenticate('jwt', { session: false }), async (req, res)=>{
  try {
      const user = await UserModel.findOneAndUpdate({ email: req.body.email }, { name: req.body.name, role: req.body.role._id}, { new: true})
      res.status(200).send({ message: 'Updated Successfully' });
    } catch (err) {
      res.status(500).send({ message: 'server side error' })
    }
})

router.delete('/user', passport.authenticate('jwt', { session: false }), async (req, res)=>{
  try {
      const user = await UserModel.findByIdAndDelete(req.body._id.trim())
      res.status(200).send({ message: 'Deleted Successfully' });
    } catch (err) {
      res.status(500).send({ message: 'server side error' })
    }
})

router.post(
  '/register',
  async (req, res, next) => {
    passport.authenticate('signup',
    async (err, user, info) => {
    if (err) return res.status(500).send({ message : err })
    if (!user || info) return res.status(300).send({ message : info })
    res.status(200).send({ message : 'Please activate your account from your email'})
    })(req, res, next);
  }
);
router.post(
  '/createuser',
  async (req, res, next) => {
    passport.authenticate('signup',
    async (err, user, info) => {
    if (err) return res.status(500).send({ message : err })
    if (!user || info) return res.status(300).send({ message : info })
    res.status(200).send(user)
    })(req, res, next);
  }
);

router.post(
  '/login',
  async (req, res, next) => {
    passport.authenticate('login',
      async (err, user, info) => {
        try {
          if (err) {
            const error = new Error('An error occurred.');
            return next(error);
          }
          if (!user) {
            return res.status(300).send(info);
          }

          req.login(
            user,
            { session: false },
            async (error) => {
              if (error) return next(error);
              const body = { name: user.name, email: user.email, role: user.role };
              const token = jwt.sign({ user: body }, process.env.JWT_ACC_ACTIVATE);

              return res.json({ ...body, token });
            }
          );
        } catch (error) {
          return next(error);
        }
      }
    )(req, res, next);
  }
);

module.exports = router