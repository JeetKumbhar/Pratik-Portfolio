const express = require("express");
const app = express();
const path = require("path");
const mongoose = require("mongoose");

main()
    .then(() => {
        console.log("Connection Successfull");
    })
    .catch((err) => console.log(err));

async function main() {
    await mongoose.connect("mongodb://127.0.0.1:27017/PratikPortfolio");
}

app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.get("/", (req, res) => {
    res.send("Working root");
})

app.listen(3000, () => {
    console.log("app is listening");
})