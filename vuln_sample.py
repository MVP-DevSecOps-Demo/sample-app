# vuln_sample.py

import os
import subprocess
import hashlib
import pickle

def run_cmd(user_input):
    # 🚨 Vulnerable: dangerous system call
    os.system("echo " + user_input)

def run_popen(user_input):
    # 🚨 Vulnerable: subprocess with shell=True
    subprocess.Popen(user_input, shell=True)

def weak_hash(pwd):
    # 🚨 Vulnerable: MD5 is insecure
    return hashlib.md5(pwd.encode()).hexdigest()

def insecure_pickle(data):
    # 🚨 Vulnerable: unsafe pickle.load
    return pickle.loads(data)
