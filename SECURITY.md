# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.2.x   | :white_check_mark: |
| < 0.2   | :x:                |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue in terX, please report it responsibly.

### How to Report

**DO NOT** create a public GitHub issue for security vulnerabilities.

Instead, please send an email to: **j@dabrowski.biz**

Include the following information:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fixes (optional)

### Response Timeline

- **Initial Response**: Within 48 hours
- **Status Update**: Within 7 days
- **Resolution Target**: Within 30 days (depending on severity)

### What to Expect

1. We will acknowledge receipt of your report
2. We will investigate and validate the issue
3. We will work on a fix and coordinate disclosure
4. We will credit you in the release notes (unless you prefer to remain anonymous)

## Security Measures in terX

terX implements several security measures:

- **End-to-End Encryption**: All stored credentials are encrypted with AES-256-GCM
- **PBKDF2 Key Derivation**: Master password is never stored, only used to derive encryption keys
- **Host Key Verification**: SSH host keys are verified to prevent MITM attacks
- **No Plain Text Storage**: Passwords and private keys are never stored unencrypted
- **Local-First**: By default, all data stays on your device

Thank you for helping keep terX secure!
