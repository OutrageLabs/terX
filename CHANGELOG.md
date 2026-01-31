# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v0.2.13] - 2026-01-31

### :bug: Bug Fixes

- Fix release body to show changelog in update popup (not downloads table)

## [v0.2.12] - 2026-01-31

### :sparkles: New Features

- Disconnect dialog with reconnect functionality - when SSH connection drops, shows dialog with Reconnect/Close options

### :wrench: Chores

- Update russh to 0.57.0

## [v0.2.11] - 2026-01-31

### :sparkles: New Features

- Display SSH authentication banner (RFC 4252) - shows server's pre-auth message if present

### :construction_worker: CI/CD

- Add macOS Intel (x64) build to release workflow

## [v0.2.10] - 2026-01-30

### :lock: Security

- Remove legacy credentials.rs with insecure key derivation

## [v0.2.9] - 2026-01-29

- Initial public release
