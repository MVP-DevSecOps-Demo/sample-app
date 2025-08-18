# vuln_sample.py
import os

# Hardcoded secret (Semgrep should flag this)
API_KEY = "12345-SECRET-HARDCODED"

# Command injection vulnerability
user_input = input("Enter a filename: ")
os.system("cat " + user_input)

# SQL injection style (unsafe string formatting)
def get_user(cursor, username):
    query = "SELECT * FROM users WHERE username = '%s'" % username
    cursor.execute(query)
