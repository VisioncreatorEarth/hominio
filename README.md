# Hominio

A Svelte project with Tauri integration for creating desktop applications.

## Prerequisites

Before getting started, make sure you have the following tools installed:

### 1. Rust

Rust is required for the Tauri backend:

```bash
# Install Rust using rustup
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Add Rust to your current shell
source "$HOME/.cargo/env"

# IMPORTANT: Add Rust to your PATH permanently
# For Bash/Zsh (add to ~/.bashrc or ~/.zshrc)
echo 'source "$HOME/.cargo/env"' >> ~/.zshrc
```

Verify Rust installation:
```bash
rustc --version
cargo --version
```

### 2. Bun

Bun is used as the JavaScript runtime and package manager:

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Add Bun to your current shell
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# IMPORTANT: Add Bun to your PATH permanently
# For Bash/Zsh (add to ~/.bashrc or ~/.zshrc)
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.zshrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.zshrc
```

Verify Bun installation:
```bash
bun --version
```

### 3. System Dependencies

#### macOS

Ensure you have Xcode Command Line Tools installed:

```bash
# Check if already installed
xcode-select -p

# If not installed, run:
xcode-select --install
```

#### Linux

Install required dependencies (Ubuntu/Debian example):

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev build-essential curl wget libssl-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

#### Windows

Make sure you have the Microsoft Visual C++ Build Tools installed:
- Install from: https://visualstudio.microsoft.com/visual-cpp-build-tools/

## Setting Up The Project

1. Clone the repository:

```bash
git clone <repository-url>
cd hominio
```

2. Install dependencies:

```bash
bun install
```

3. Install Tauri CLI (this may have already been done by bun install):

```bash
bun add -D @tauri-apps/cli@next
```

## Development

Start the development server:

```bash
bun tauri dev
```

This will:
- Launch the Svelte frontend development server
- Compile the Rust backend
- Open the Tauri application window with your app

> **Note**: If you open a new terminal and get "command not found: bun", make sure you either:
> 1. Source your profile: `source ~/.zshrc` (or equivalent for your shell)
> 2. Or restart your terminal for the PATH changes to take effect

## Building for Production

Create a production build:

```bash
bun tauri build
```

This will generate executable files in the `src-tauri/target/release` directory.

## Project Structure

- `src/` - Svelte frontend code
- `src-tauri/` - Tauri/Rust backend code
- `static/` - Static assets

## Troubleshooting

### Common Issues

1. **"Command not found: bun" or "Command not found: tauri"**:
   - Make sure you've added Bun to your PATH as described in the installation steps
   - Run `source ~/.zshrc` or restart your terminal
   - Verify with `which bun` to confirm Bun is in your PATH

2. **Compilation errors in Rust code**:
   - Ensure you have the latest Rust toolchain: `rustup update`

3. **Missing system dependencies**:
   - Make sure Xcode Command Line Tools are installed on macOS
   - On Linux, install all required system packages
   - On Windows, verify Visual C++ Build Tools are properly installed

### More Resources

- If you encounter any issues with Tauri, check the [Tauri v2 documentation](https://v2.tauri.app/)
- For Rust-related issues, visit [Rust documentation](https://www.rust-lang.org/learn)
- For Bun issues, see [Bun documentation](https://bun.sh/docs)
