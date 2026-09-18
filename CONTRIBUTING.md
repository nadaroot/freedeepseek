# Contributing to FreeDeepseek

Contributions, issue reports, and suggestions are welcome.

### How to Contribute

1. Fork the repository.
2. Create a feature branch: `git checkout -b feature/my-feature`.
3. Make your changes adhering to existing code conventions (pure Node.js built-in modules without unnecessary external dependencies).
4. Run self-checks and tests: `npm test`.
5. Commit your changes with clear, concise commit messages.
6. Push to your branch and open a Pull Request.

### Development Guidelines

- **Zero dependencies**: Keep the core server lightweight by relying on built-in Node.js modules.
- **Compatibility**: Ensure changes work across Node.js 18, 20, and 22.
- **Privacy & Security**: Never commit tokens, session IDs, or private keys to the repository.

### Reporting Issues

If you encounter bugs, auth issues, or API changes from DeepSeek, please open an issue describing:
- Node.js version and OS.
- Error logs or output of `npm run doctor`.
- Steps to reproduce.
