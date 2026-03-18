var cloudinary = require("cloudinary").v2;
var multer = require("multer");
var CloudinaryStorage = require("multer-storage-cloudinary").CloudinaryStorage;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

var storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "mcnaughton-madness",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ width: 400, height: 400, crop: "fill", gravity: "face" }],
  },
});

var upload = multer({ storage: storage });

module.exports = {
  cloudinary: cloudinary,
  upload: upload,
};
