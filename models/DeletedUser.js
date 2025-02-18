const mongoose = require("mongoose");

const deletedUserShema = new mongoose.Schema(
  {
    tableId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 15,
    },
    userId: {
      type: String,
      required: true,
    },
    availableTimes: [
      {
        type: String,
      },
    ],
  },
  { timestamps: true }
);

const DeletedUser = mongoose.model("DeletedUser", deletedUserShema);
module.exports = DeletedUser;
