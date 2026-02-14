const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { TIMEZONE } = require("../utils/constants");

const visiterSchema = new mongoose.Schema({
     date: {
          type: String,
          required: true,
          unique: true,
          default: () => moment().tz(TIMEZONE).format("YYYY-MM-DD"),
     },
     todayVisitLandingPage: { type: Number, default: 0 },
     totalVisitLandingPage: { type: Number, default: 0 },

     todayVisitCreatePage: { type: Number, default: 0 },
     totalVisitCreatePage: { type: Number, default: 0 },

     todayVisitAboutPage: { type: Number, default: 0 },
     totalVisitAboutPage: { type: Number, default: 0 },

     todayVisitUsePage: { type: Number, default: 0 },
     totalVisitUsePage: { type: Number, default: 0 },

     todayTableCreateCount: { type: Number, default: 0 },
     totalTableCreateCount: { type: Number, default: 0 },

     todaySignUp: { type: Number, default: 0 },
     totalSignUp: { type: Number, default: 0 },

     todayLogin: { type: Number, default: 0 },
     totalLogin: { type: Number, default: 0 },
});

visiterSchema.pre("save", async function (next) {
     if (this.isNew) {
          return next();
     }

     try {
          const previousData = await mongoose.model("Visiter").findOne({ date: this.date });

          if (previousData) {
               if (this.isModified("todayVisitLandingPage")) {
                    this.totalVisitLandingPage = previousData.totalVisitLandingPage + 1;
               }
               if (this.isModified("todayVisitCreatePage")) {
                    this.totalVisitCreatePage = previousData.totalVisitCreatePage + 1;
               }
               if (this.isModified("todayVisitAboutPage")) {
                    this.totalVisitAboutPage = previousData.totalVisitAboutPage + 1;
               }
               if (this.isModified("todayVisitUsePage")) {
                    this.totalVisitUsePage = previousData.totalVisitUsePage + 1;
               }

               if (this.isModified("todaySignUp")) {
                    this.totalSignUp = previousData.totalSignUp + 1;
               }
               if (this.isModified("todayLogin")) {
                    this.totalLogin = previousData.totalLogin + 1;
               }
          }
     } catch (error) {
          return next(error);
     }

     next();
});

const Visiter = mongoose.model("Visiter", visiterSchema);
module.exports = Visiter;
