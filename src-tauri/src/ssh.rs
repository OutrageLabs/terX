// ssh.rs
// SSH client based on russh

use russh::client::{self, Config, Handler, Msg};
use russh::keys::{PrivateKeyWithHashAlg, PublicKey};
use russh::{Channel, ChannelMsg};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;

use crate::credentials::{CredentialsManager, Host};
use russh_sftp::client::SftpSession;

/// Ghostty terminfo data (from `infocmp -x xterm-ghostty`)
/// Used for automatic installation on remote hosts
const GHOSTTY_TERMINFO: &str = r#"xterm-ghostty|ghostty|Ghostty,
	am, bce, ccc, hs, km, mc5i, mir, msgr, npc, xenl, AX, Su, Tc, XT, fullkbd,
	colors#256, cols#80, it#8, lines#24, pairs#32767,
	acsc=++\,\,--..00``aaffgghhiijjkkllmmnnooppqqrrssttuuvvwwxxyyzz{{||}}~~,
	bel=^G, blink=\E[5m, bold=\E[1m, cbt=\E[Z, civis=\E[?25l,
	clear=\E[H\E[2J, cnorm=\E[?12l\E[?25h, cr=^M,
	csr=\E[%i%p1%d;%p2%dr, cub=\E[%p1%dD, cub1=^H,
	cud=\E[%p1%dB, cud1=^J, cuf=\E[%p1%dC, cuf1=\E[C,
	cup=\E[%i%p1%d;%p2%dH, cuu=\E[%p1%dA, cuu1=\E[A,
	cvvis=\E[?12;25h, dch=\E[%p1%dP, dch1=\E[P, dim=\E[2m,
	dl=\E[%p1%dM, dl1=\E[M, dsl=\E]2;\007, ech=\E[%p1%dX,
	ed=\E[J, el=\E[K, el1=\E[1K, flash=\E[?5h$<100/>\E[?5l,
	fsl=^G, home=\E[H, hpa=\E[%i%p1%dG, ht=^I, hts=\EH,
	ich=\E[%p1%d@, ich1=\E[@, il=\E[%p1%dL, il1=\E[L, ind=^J,
	indn=\E[%p1%dS,
	initc=\E]4;%p1%d;rgb\:%p2%{255}%*%{1000}%/%2.2X/%p3%{255}%*%{1000}%/%2.2X/%p4%{255}%*%{1000}%/%2.2X\E\\,
	invis=\E[8m, kDC=\E[3;2~, kEND=\E[1;2F, kHOM=\E[1;2H,
	kIC=\E[2;2~, kLFT=\E[1;2D, kNXT=\E[6;2~, kPRV=\E[5;2~,
	kRIT=\E[1;2C, kbs=\177, kcbt=\E[Z, kcub1=\EOD, kcud1=\EOB,
	kcuf1=\EOC, kcuu1=\EOA, kdch1=\E[3~, kend=\EOF, kent=\EOM,
	kf1=\EOP, kf10=\E[21~, kf11=\E[23~, kf12=\E[24~,
	kf13=\E[1;2P, kf14=\E[1;2Q, kf15=\E[1;2R, kf16=\E[1;2S,
	kf17=\E[15;2~, kf18=\E[17;2~, kf19=\E[18;2~, kf2=\EOQ,
	kf20=\E[19;2~, kf21=\E[20;2~, kf22=\E[21;2~,
	kf23=\E[23;2~, kf24=\E[24;2~, kf25=\E[1;5P, kf26=\E[1;5Q,
	kf27=\E[1;5R, kf28=\E[1;5S, kf29=\E[15;5~, kf3=\EOR,
	kf30=\E[17;5~, kf31=\E[18;5~, kf32=\E[19;5~,
	kf33=\E[20;5~, kf34=\E[21;5~, kf35=\E[23;5~,
	kf36=\E[24;5~, kf37=\E[1;6P, kf38=\E[1;6Q, kf39=\E[1;6R,
	kf4=\EOS, kf40=\E[1;6S, kf41=\E[15;6~, kf42=\E[17;6~,
	kf43=\E[18;6~, kf44=\E[19;6~, kf45=\E[20;6~,
	kf46=\E[21;6~, kf47=\E[23;6~, kf48=\E[24;6~,
	kf49=\E[1;3P, kf5=\E[15~, kf50=\E[1;3Q, kf51=\E[1;3R,
	kf52=\E[1;3S, kf53=\E[15;3~, kf54=\E[17;3~,
	kf55=\E[18;3~, kf56=\E[19;3~, kf57=\E[20;3~,
	kf58=\E[21;3~, kf59=\E[23;3~, kf6=\E[17~, kf60=\E[24;3~,
	kf61=\E[1;4P, kf62=\E[1;4Q, kf63=\E[1;4R, kf7=\E[18~,
	kf8=\E[19~, kf9=\E[20~, khome=\EOH, kich1=\E[2~,
	kind=\E[1;2B, kmous=\E[<, knp=\E[6~, kpp=\E[5~,
	kri=\E[1;2A, oc=\E]104\007, op=\E[39;49m, rc=\E8,
	rep=%p1%c\E[%p2%{1}%-%db, rev=\E[7m, ri=\EM,
	rin=\E[%p1%dT, ritm=\E[23m, rmacs=\E(B, rmam=\E[?7l,
	rmcup=\E[?1049l, rmir=\E[4l, rmkx=\E[?1l\E>, rmso=\E[27m,
	rmul=\E[24m, rs1=\E]\E\\\Ec, sc=\E7,
	setab=\E[%?%p1%{8}%<%t4%p1%d%e%p1%{16}%<%t10%p1%{8}%-%d%e48;5;%p1%d%;m,
	setaf=\E[%?%p1%{8}%<%t3%p1%d%e%p1%{16}%<%t9%p1%{8}%-%d%e38;5;%p1%d%;m,
	sgr=%?%p9%t\E(0%e\E(B%;\E[0%?%p6%t;1%;%?%p2%t;4%;%?%p1%p3%|%t;7%;%?%p4%t;5%;%?%p7%t;8%;m,
	sgr0=\E(B\E[m, sitm=\E[3m, smacs=\E(0, smam=\E[?7h,
	smcup=\E[?1049h, smir=\E[4h, smkx=\E[?1h\E=, smso=\E[7m,
	smul=\E[4m, tbc=\E[3g, tsl=\E]2;, u6=\E[%i%d;%dR, u7=\E[6n,
	u8=\E[?%[;0123456789]c, u9=\E[c, vpa=\E[%i%p1%dd,
	BD=\E[?2004l, BE=\E[?2004h, Clmg=\E[s,
	Cmg=\E[%i%p1%d;%p2%ds, Dsmg=\E[?69l, E3=\E[3J,
	Enmg=\E[?69h, Ms=\E]52;%p1%s;%p2%s\007, PE=\E[201~,
	PS=\E[200~, RV=\E[>c, Se=\E[2 q,
	Setulc=\E[58\:2\:\:%p1%{65536}%/%d\:%p1%{256}%/%{255}%&%d\:%p1%{255}%&%d%;m,
	Smulx=\E[4\:%p1%dm, Ss=\E[%p1%d q,
	Sync=\E[?2026%?%p1%{1}%-%tl%eh%;,
	XM=\E[?1006;1000%?%p1%{1}%=%th%el%;, XR=\E[>0q,
	fd=\E[?1004l, fe=\E[?1004h, kDC3=\E[3;3~, kDC4=\E[3;4~,
	kDC5=\E[3;5~, kDC6=\E[3;6~, kDC7=\E[3;7~, kDN=\E[1;2B,
	kDN3=\E[1;3B, kDN4=\E[1;4B, kDN5=\E[1;5B, kDN6=\E[1;6B,
	kDN7=\E[1;7B, kEND3=\E[1;3F, kEND4=\E[1;4F,
	kEND5=\E[1;5F, kEND6=\E[1;6F, kEND7=\E[1;7F,
	kHOM3=\E[1;3H, kHOM4=\E[1;4H, kHOM5=\E[1;5H,
	kHOM6=\E[1;6H, kHOM7=\E[1;7H, kIC3=\E[2;3~, kIC4=\E[2;4~,
	kIC5=\E[2;5~, kIC6=\E[2;6~, kIC7=\E[2;7~, kLFT3=\E[1;3D,
	kLFT4=\E[1;4D, kLFT5=\E[1;5D, kLFT6=\E[1;6D,
	kLFT7=\E[1;7D, kNXT3=\E[6;3~, kNXT4=\E[6;4~,
	kNXT5=\E[6;5~, kNXT6=\E[6;6~, kNXT7=\E[6;7~,
	kPRV3=\E[5;3~, kPRV4=\E[5;4~, kPRV5=\E[5;5~,
	kPRV6=\E[5;6~, kPRV7=\E[5;7~, kRIT3=\E[1;3C,
	kRIT4=\E[1;4C, kRIT5=\E[1;5C, kRIT6=\E[1;6C,
	kRIT7=\E[1;7C, kUP=\E[1;2A, kUP3=\E[1;3A, kUP4=\E[1;4A,
	kUP5=\E[1;5A, kUP6=\E[1;6A, kUP7=\E[1;7A, kxIN=\E[I,
	kxOUT=\E[O, rmxx=\E[29m, rv=\E\\[[0-9]+;[0-9]+;[0-9]+c,
	setrgbb=\E[48\:2\:%p1%d\:%p2%d\:%p3%dm,
	setrgbf=\E[38\:2\:%p1%d\:%p2%d\:%p3%dm, smxx=\E[9m,
	xm=\E[<%i%p3%d;%p1%d;%p2%d;%?%p4%tM%em%;,
	xr=\EP>\\|[ -~]+a\E\\,
"#;

/// Handler for SSH client (public for SFTP reuse)
/// In russh 0.56+, data is received via Channel::wait(), not Handler callbacks
pub struct SshHandler;

impl Handler for SshHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // TODO: Implement server key verification
        // For now, accept all keys (like ssh -o StrictHostKeyChecking=no)
        log::warn!("SSH: Accepting server key without verification");
        Ok(true)
    }
}

/// SSH authentication method
#[allow(dead_code)]
pub enum AuthMethod {
    Password(String),
    Key { key_data: String, passphrase: Option<String> },
    KeyFile { path: String, passphrase: Option<String> },
    Agent,
}

/// SSH session
pub struct SshSession {
    session: Arc<client::Handle<SshHandler>>,
    /// Channel for receiving data from the channel polling task
    output_rx: mpsc::Receiver<Vec<u8>>,
}

/// Channels for sending data to SSH session (can be cloned and stored)
pub struct SshSessionChannels {
    /// Channel for sending data to SSH server
    pub input_tx: mpsc::Sender<Vec<u8>>,
    /// Channel for sending resize commands
    pub resize_tx: mpsc::Sender<(u32, u32)>,
}

/// Signal for session close (separate to avoid borrow conflicts)
pub struct SshCloseSignal {
    close_rx: mpsc::Receiver<()>,
}

impl SshCloseSignal {
    /// Wait for close signal (EOF/close from server)
    pub async fn wait(&mut self) -> Option<()> {
        self.close_rx.recv().await
    }
}

impl SshSession {
    /// Get a reference to the session handle for creating additional channels (e.g., SFTP)
    pub fn handle(&self) -> Arc<client::Handle<SshHandler>> {
        self.session.clone()
    }
}

/// Create SFTP session from an SSH handle
pub async fn create_sftp_session(handle: &client::Handle<SshHandler>) -> Result<SftpSession, SshError> {
    // Open a new session channel for SFTP
    let channel = handle
        .channel_open_session()
        .await
        .map_err(|e| SshError::Channel(format!("Failed to open SFTP channel: {}", e)))?;

    // Request SFTP subsystem
    channel
        .request_subsystem(false, "sftp")
        .await
        .map_err(|e| SshError::Channel(format!("Failed to request SFTP subsystem: {}", e)))?;

    // Create SFTP session from channel stream
    let sftp = SftpSession::new(channel.into_stream())
        .await
        .map_err(|e| SshError::Channel(format!("Failed to initialize SFTP: {}", e)))?;

    Ok(sftp)
}

/// Check if xterm-ghostty terminfo exists on remote, install if missing.
/// Returns the terminal type to use (xterm-ghostty or xterm-256color fallback).
async fn ensure_terminfo(session: &client::Handle<SshHandler>) -> String {
    const TIMEOUT: Duration = Duration::from_secs(3);
    const GHOSTTY_TERM: &str = "xterm-ghostty";
    const FALLBACK_TERM: &str = "xterm-256color";

    // Helper to run a command and get output
    async fn run_command(session: &client::Handle<SshHandler>, cmd: &str) -> Result<String, String> {
        let mut channel = session
            .channel_open_session()
            .await
            .map_err(|e| format!("Failed to open channel: {}", e))?;

        channel
            .exec(true, cmd)
            .await
            .map_err(|e| format!("Failed to exec: {}", e))?;

        let mut output = Vec::new();
        loop {
            match channel.wait().await {
                Some(ChannelMsg::Data { data }) => {
                    output.extend_from_slice(&data);
                }
                Some(ChannelMsg::ExtendedData { data, .. }) => {
                    // stderr - ignore for now
                    let _ = data;
                }
                Some(ChannelMsg::Eof) | Some(ChannelMsg::Close) | None => break,
                _ => {}
            }
        }

        String::from_utf8(output).map_err(|e| format!("Invalid UTF-8: {}", e))
    }

    // Try with timeout
    let result = tokio::time::timeout(TIMEOUT, async {
        // Step 1: Check if terminfo exists
        log::info!("SSH: Checking for {} terminfo on remote...", GHOSTTY_TERM);
        let check_cmd = format!("infocmp {} >/dev/null 2>&1 && echo EXISTS || echo MISSING", GHOSTTY_TERM);

        match run_command(session, &check_cmd).await {
            Ok(output) => {
                let output = output.trim();
                if output == "EXISTS" {
                    log::info!("SSH: {} terminfo already installed", GHOSTTY_TERM);
                    return GHOSTTY_TERM.to_string();
                }
                log::info!("SSH: {} terminfo not found, installing...", GHOSTTY_TERM);
            }
            Err(e) => {
                log::warn!("SSH: Failed to check terminfo: {}", e);
                return FALLBACK_TERM.to_string();
            }
        }

        // Step 2: Install terminfo using tic
        // We use a heredoc-style approach: echo the terminfo and pipe to tic
        let install_cmd = format!(
            "cat <<'TERMINFO_EOF' | tic -x - 2>/dev/null && echo OK || echo FAILED\n{}\nTERMINFO_EOF",
            GHOSTTY_TERMINFO.trim()
        );

        match run_command(session, &install_cmd).await {
            Ok(output) => {
                let output = output.trim();
                if output == "OK" {
                    log::info!("SSH: {} terminfo installed successfully", GHOSTTY_TERM);
                    GHOSTTY_TERM.to_string()
                } else {
                    log::warn!("SSH: Failed to install terminfo (tic failed), using fallback");
                    FALLBACK_TERM.to_string()
                }
            }
            Err(e) => {
                log::warn!("SSH: Failed to install terminfo: {}, using fallback", e);
                FALLBACK_TERM.to_string()
            }
        }
    })
    .await;

    match result {
        Ok(term) => term,
        Err(_) => {
            log::warn!("SSH: Terminfo check timed out, using fallback");
            FALLBACK_TERM.to_string()
        }
    }
}

impl SshSession {
    /// Create new SSH session
    /// Returns (session, channels, close_signal)
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        auth: AuthMethod,
        terminal_type: &str,
        cols: u32,
        rows: u32,
    ) -> Result<(Self, SshSessionChannels, SshCloseSignal), SshError> {
        let config = Config::default();
        let config = Arc::new(config);

        let handler = SshHandler;

        // Connection
        let addr = format!("{}:{}", host, port);
        log::info!("SSH: Connecting to {}", addr);

        let mut session = client::connect(config, &addr, handler)
            .await
            .map_err(|e| SshError::Connection(e.to_string()))?;

        // Authentication
        let authenticated = match auth {
            AuthMethod::Password(password) => {
                log::info!("SSH: Authenticating with password");
                session
                    .authenticate_password(username, &password)
                    .await
                    .map_err(|e| SshError::Auth(e.to_string()))?
                    .success()
            }
            AuthMethod::Key { key_data, passphrase } => {
                log::info!("SSH: Authenticating with key (data length: {} bytes)", key_data.len());
                let key_pair = if let Some(ref pass) = passphrase {
                    log::info!("SSH: Decoding key with passphrase");
                    russh::keys::decode_secret_key(&key_data, Some(pass))
                        .map_err(|e| {
                            log::error!("SSH: Key decode failed: {}", e);
                            SshError::Key(e.to_string())
                        })?
                } else {
                    log::info!("SSH: Decoding key without passphrase");
                    russh::keys::decode_secret_key(&key_data, None)
                        .map_err(|e| {
                            log::error!("SSH: Key decode failed: {}", e);
                            SshError::Key(e.to_string())
                        })?
                };
                log::info!("SSH: Key decoded successfully");
                log::info!("SSH: Calling authenticate_publickey...");

                // Add timeout for authentication
                let auth_future = session.authenticate_publickey(username, PrivateKeyWithHashAlg::new(Arc::new(key_pair), None));
                match tokio::time::timeout(std::time::Duration::from_secs(30), auth_future).await {
                    Ok(result) => {
                        match result {
                            Ok(auth_result) => {
                                log::info!("SSH: authenticate_publickey result: {:?}", auth_result);
                                auth_result.success()
                            }
                            Err(e) => {
                                log::error!("SSH: Key auth error: {}", e);
                                return Err(SshError::Auth(format!("Key authentication error: {}", e)));
                            }
                        }
                    }
                    Err(_) => {
                        log::error!("SSH: Key authentication timed out after 30 seconds");
                        return Err(SshError::Auth("Key authentication timed out".to_string()));
                    }
                }
            }
            AuthMethod::KeyFile { path, passphrase } => {
                log::info!("SSH: Authenticating with key file: {}", path);
                let key_data = std::fs::read_to_string(&path)
                    .map_err(|e| SshError::Key(format!("Cannot read key file: {}", e)))?;
                let key_pair = if let Some(pass) = passphrase {
                    russh::keys::decode_secret_key(&key_data, Some(&pass))
                        .map_err(|e| SshError::Key(e.to_string()))?
                } else {
                    russh::keys::decode_secret_key(&key_data, None)
                        .map_err(|e| SshError::Key(e.to_string()))?
                };
                session
                    .authenticate_publickey(username, PrivateKeyWithHashAlg::new(Arc::new(key_pair), None))
                    .await
                    .map_err(|e| SshError::Auth(e.to_string()))?
                    .success()
            }
            AuthMethod::Agent => {
                log::info!("SSH: Authenticating with SSH agent");
                // TODO: Implement SSH agent
                return Err(SshError::Auth("SSH agent not implemented yet".to_string()));
            }
        };

        if !authenticated {
            return Err(SshError::Auth("Authentication failed - check credentials or ensure public key is in authorized_keys".to_string()));
        }

        log::info!("SSH: Authenticated successfully");

        // Ensure terminfo is available on remote (auto-install if missing)
        let actual_terminal_type = if terminal_type == "xterm-ghostty" {
            ensure_terminfo(&session).await
        } else {
            terminal_type.to_string()
        };

        // Open channel
        let channel = session
            .channel_open_session()
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        // Request PTY
        log::info!("SSH: Requesting PTY with terminal type: {}, size: {}x{}", actual_terminal_type, cols, rows);
        channel
            .request_pty(
                false,
                &actual_terminal_type,
                cols,
                rows,
                0,   // pix_width
                0,   // pix_height
                &[], // terminal modes
            )
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        // Request shell
        log::info!("SSH: Requesting shell");
        channel
            .request_shell(false)
            .await
            .map_err(|e| SshError::Channel(e.to_string()))?;

        // Create channels for communication
        let (output_tx, output_rx) = mpsc::channel(8192);
        let (input_tx, input_rx) = mpsc::channel(1024);
        let (resize_tx, resize_rx) = mpsc::channel(16);
        let (close_tx, close_rx) = mpsc::channel(1);

        // Spawn task to poll channel and forward data
        tokio::spawn(Self::channel_loop(channel, output_tx, input_rx, resize_rx, close_tx));

        Ok((
            Self {
                session: Arc::new(session),
                output_rx,
            },
            SshSessionChannels {
                input_tx,
                resize_tx,
            },
            SshCloseSignal { close_rx },
        ))
    }

    /// Background task that polls Channel::wait() and handles I/O
    async fn channel_loop(
        mut channel: Channel<Msg>,
        output_tx: mpsc::Sender<Vec<u8>>,
        mut input_rx: mpsc::Receiver<Vec<u8>>,
        mut resize_rx: mpsc::Receiver<(u32, u32)>,
        close_tx: mpsc::Sender<()>,
    ) {
        loop {
            tokio::select! {
                // Data from SSH server (via channel.wait())
                msg = channel.wait() => {
                    match msg {
                        Some(ChannelMsg::Data { data }) => {
                            if output_tx.send(data.to_vec()).await.is_err() {
                                log::warn!("SSH: Output channel closed");
                                break;
                            }
                        }
                        Some(ChannelMsg::ExtendedData { data, .. }) => {
                            // stderr
                            if output_tx.send(data.to_vec()).await.is_err() {
                                log::warn!("SSH: Output channel closed");
                                break;
                            }
                        }
                        Some(ChannelMsg::Eof) => {
                            log::info!("SSH: Channel EOF received");
                            let _ = close_tx.send(()).await;
                            break;
                        }
                        Some(ChannelMsg::Close) => {
                            log::info!("SSH: Channel closed by server");
                            let _ = close_tx.send(()).await;
                            break;
                        }
                        Some(ChannelMsg::ExitStatus { exit_status }) => {
                            log::info!("SSH: Exit status: {}", exit_status);
                            // Don't break - might still have data
                        }
                        Some(ChannelMsg::ExitSignal { signal_name, .. }) => {
                            log::info!("SSH: Exit signal: {:?}", signal_name);
                        }
                        Some(ChannelMsg::WindowAdjusted { .. }) => {
                            // Flow control - handled automatically
                        }
                        Some(_) => {
                            // Other messages - ignore
                        }
                        None => {
                            log::info!("SSH: Channel closed");
                            let _ = close_tx.send(()).await;
                            break;
                        }
                    }
                }

                // Data to send to SSH server
                Some(data) = input_rx.recv() => {
                    if let Err(e) = channel.data(&data[..]).await {
                        log::error!("SSH: Write error: {}", e);
                        break;
                    }
                }

                // Resize terminal
                Some((cols, rows)) = resize_rx.recv() => {
                    if let Err(e) = channel.window_change(cols, rows, 0, 0).await {
                        log::error!("SSH: Resize error: {}", e);
                    }
                }
            }
        }
    }

    /// Receive data from server (non-blocking)
    #[allow(dead_code)]
    pub fn try_recv(&mut self) -> Option<Vec<u8>> {
        self.output_rx.try_recv().ok()
    }

    /// Receive data from server (blocking)
    pub async fn recv(&mut self) -> Option<Vec<u8>> {
        self.output_rx.recv().await
    }
}


/// Helper function to create session from sshManager host
#[allow(dead_code)]
pub async fn connect_from_host(
    host: &Host,
    credentials: &CredentialsManager,
    key_index: Option<usize>,
    cols: u32,
    rows: u32,
) -> Result<(SshSession, SshSessionChannels, SshCloseSignal), SshError> {
    let port: u16 = host.port.parse().unwrap_or(22);
    let terminal_type = if host.terminal_type.is_empty() {
        "xterm-ghostty"
    } else {
        &host.terminal_type
    };

    // Determine authentication method
    // password_id >= 0: password from passwords[password_id] array
    // password_id < 0: key from keys[-(password_id + 1)] array
    let auth = if let Some(idx) = key_index {
        // Use explicitly provided key
        if let Some(key) = credentials.get_key(idx) {
            if let Some(key_data) = credentials.get_key_data(key) {
                AuthMethod::Key {
                    key_data,
                    passphrase: None,
                }
            } else if !key.path.is_empty() {
                AuthMethod::KeyFile {
                    path: key.path.clone(),
                    passphrase: None,
                }
            } else {
                return Err(SshError::Auth("No key data available".to_string()));
            }
        } else {
            return Err(SshError::Auth("Key not found".to_string()));
        }
    } else if host.password_id < 0 {
        // Negative password_id = SSH key from config
        if let Some(key_data) = credentials.get_key_for_host(host) {
            log::info!("SSH: Using SSH key from config (password_id: {})", host.password_id);
            AuthMethod::Key {
                key_data,
                passphrase: None,
            }
        } else {
            return Err(SshError::Auth(format!("SSH key not found for password_id: {}", host.password_id)));
        }
    } else if let Some(password) = credentials.get_password_for_host(host) {
        // Non-negative/zero password_id = password from config
        log::info!("SSH: Using password from config (password_id: {})", host.password_id);
        AuthMethod::Password(password)
    } else {
        // Fallback: try default SSH keys
        let home = dirs::home_dir().unwrap_or_default();
        let key_paths = [
            home.join(".ssh/id_ed25519"),
            home.join(".ssh/id_rsa"),
            home.join(".ssh/id_ecdsa"),
        ];

        let mut found_key: Option<String> = None;
        for key_path in &key_paths {
            if key_path.exists() {
                log::info!("SSH: Fallback to default key: {:?}", key_path);
                found_key = Some(key_path.to_string_lossy().to_string());
                break;
            }
        }

        if let Some(path) = found_key {
            AuthMethod::KeyFile {
                path,
                passphrase: None,
            }
        } else {
            return Err(SshError::Auth("No authentication method available (no password in config, no SSH keys found)".to_string()));
        }
    };

    SshSession::connect(&host.ip, port, &host.login, auth, terminal_type, cols, rows).await
}

#[derive(Debug, thiserror::Error)]
pub enum SshError {
    #[error("Connection failed: {0}")]
    Connection(String),
    #[error("Authentication failed: {0}")]
    Auth(String),
    #[error("Key error: {0}")]
    Key(String),
    #[error("Channel error: {0}")]
    Channel(String),
}
