// app extension is .js
// 🧠 Intentionally vulnerable sample for SonarQube testing
const express = require('express');
const app = express();
const fs = require('fs');

// 1️⃣ XSS vulnerability — unsanitized user input rendered to response
app.get('/search', (req, res) => {
  res.send("Results for: " + req.query.q);
});

// 2️⃣ Command injection — unsanitized input passed to shell
const { exec } = require('child_process');
app.get('/ping', (req, res) => {
  exec("ping -c 1 " + req.query.host, (err, stdout, stderr) => {
    if (err) {
      return res.send("Error: " + stderr);
    }
    res.send(stdout);
  });
});

// 3️⃣ Hardcoded secret — will trigger Sonar secret detection
const dbPassword = "P@ssw0rd123"; // Sensitive credential in code

// 4️⃣ Insecure file access — potential path traversal
app.get('/read', (req, res) => {
  const filename = req.query.file;
  const data = fs.readFileSync("./uploads/" + filename, "utf8");
  res.send(data);
});

app.listen(3000, () => console.log("Server running on port 3000"));
