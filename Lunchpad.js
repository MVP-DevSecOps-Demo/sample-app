// BAD PRACTICE: Hardcoded credentials
const adminUser = "admin";
const adminPass = "password123";

// BAD PRACTICE: Using eval with untrusted input
function runUserCode(userInput) {
    eval(userInput); // DANGEROUS: Remote code execution risk
}

// BAD PRACTICE: Unsanitized user input in HTML (XSS)
function displayMessage(msg) {
    document.getElementById("output").innerHTML = "User says: " + msg;
}

// BAD PRACTICE: Insecure HTTP request and sensitive data in query string
function sendLogin(user, pass) {
    fetch(`http://example.com/login?user=${user}&pass=${pass}`)
        .then(response => response.json())
        .then(data => console.log(data));
}

// BAD PRACTICE: Using weak random number for security purposes
function generateToken() {
    return Math.random().toString(36).substring(2);
}

// BAD PRACTICE: No input validation (SQL Injection example)
const sqlite3 = require('sqlite3').verbose();
let db = new sqlite3.Database(':memory:');

function unsafeQuery(userId) {
    let query = `SELECT * FROM users WHERE id = ${userId}`; // SQL Injection risk
    db.all(query, [], (err, rows) => {
        if (err) throw err;
        console.log(rows);
    });
}

// BAD PRACTICE: Storing sensitive info in localStorage
function storeSecret(secret) {
    localStorage.setItem("secret", secret);
}

// BAD PRACTICE: Using innerHTML with external content
fetch("http://example.com/content")
    .then(res => res.text())
    .then(html => document.body.innerHTML += html);

// BAD PRACTICE: Exposing stack trace to users
process.on('uncaughtException', (err) => {
    console.error(err.stack); // leaks server info
});
