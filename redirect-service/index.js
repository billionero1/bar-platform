import express from "express";

const app = express();
const TARGET_URL = "https://www.bar-calc.ru";

app.use((req, res) => {
  res.redirect(301, TARGET_URL);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Redirecting all to ${TARGET_URL}`));
