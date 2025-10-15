from flask import Flask, request, jsonify
import sqlite3, os, pickle, base64

app = Flask(__name__)

# 🚨 Hardcoded secret (sensitive info disclosure)
API_KEY = "12345-SECRET-KEY"

DB_FILE = "users.db"

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT, password TEXT)")
    conn.commit()
    conn.close()

@app.route("/")
def home():
    return "Vulnerable Flask App – OWASP Demo"

# 🚨 SQL Injection vulnerability
@app.route("/login", methods=["POST"])
def login():
    username = request.form.get("username")
    password = request.form.get("password")

    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()

    query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
    print("[DEBUG] Executing query:", query)

    c.execute(query)  # 🚨 vulnerable line
    result = c.fetchone()
    conn.close()

    if result:
        return jsonify({"message": "Login successful"})
    else:
        return jsonify({"message": "Invalid credentials"}), 401

# 🚨 Command Injection vulnerability
@app.route("/ping", methods=["GET"])
def ping():
    host = request.args.get("host", "127.0.0.1")
    output = os.popen(f"ping -c 1 {host}").read()  # 🚨 unsanitized user input
    return f"<pre>{output}</pre>"

# 🚨 Insecure deserialization
@app.route("/deserialize", methods=["POST"])
def deserialize():
    data = request.data
    try:
        obj = pickle.loads(base64.b64decode(data))  # 🚨 arbitrary code execution
        return jsonify({"result": str(obj)})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# 🚨 Sensitive file access
@app.route("/readfile")
def read_file():
    filename = request.args.get("file", "/etc/passwd")
    try:
        with open(filename, "r") as f:
            return f"<pre>{f.read()}</pre>"
    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
