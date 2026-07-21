/* ==========================================================================
   A.G.N.I. // TACTICAL COMMAND - SCRIPT ENGINE & HARDWARE GATEWAY
   ========================================================================== */

// --- HARDWARE WI-FI CONFIGURATION (VIVO HOTSPOT IP) ---
const ARDUINO_IP = "http://10.95.188.187";

// Global Control State
const STATE = {
    servoAngle: 80,
    pumpActive: false,
    motorDirection: 'STOP'
};

// ================= 0. HARDWARE COMMUNICATION GATEWAY =================
function sendHardwareCommand(action, value = null) {
    let url = `${ARDUINO_IP}/cmd?action=${action}`;
    if (value !== null) url += `&val=${value}`;

    // Sends HTTP GET request directly to Arduino Uno R4 WiFi
    fetch(url, { mode: 'no-cors' })
        .then(() => logTerminal('SYS', `TRANSMITTED: ${action} ${value !== null ? value : ''}`))
        .catch(() => logTerminal('SYS', `ERR: Command Transmission Failed`));
}

// ================= 1. TERMINAL LOGGER =================
function logTerminal(type, message) {
    const output = document.getElementById('terminalOutput');
    if (!output) return;

    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const timeStr = `[${hours}:${minutes}:${seconds}]`;

    const line = document.createElement('div');
    line.className = 'terminal-line';

    let tagClass = 'log-tag-sys';
    if (type === 'CONTROL') tagClass = 'log-tag-control';

    line.innerHTML = `<span class="log-timestamp">${timeStr}</span> <span class="${tagClass}">[${type}]</span> ${message}`;

    output.appendChild(line);
    output.scrollTop = output.scrollHeight;
}

// ================= 2. HEADER CLOCK =================
function startHeaderClock() {
    const clockEl = document.getElementById('headerClock');
    setInterval(() => {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        if (clockEl) clockEl.innerText = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

// ================= 3. NOZZLE AIM GAUGE RENDERER =================
function drawGaugeArc(angle) {
    const canvas = document.getElementById('gaugeCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height - 20;
    const radius = 95;

    ctx.clearRect(0, 0, width, height);

    // Track Arc
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, 2 * Math.PI, false);
    ctx.lineWidth = 14;
    ctx.strokeStyle = 'rgba(255, 85, 0, 0.18)';
    ctx.stroke();

    // Outer Scale Ticks
    for (let a = 0; a <= 180; a += 10) {
        const radAngle = Math.PI + (a / 180) * Math.PI;
        const xOuter = centerX + Math.cos(radAngle) * (radius + 14);
        const yOuter = centerY + Math.sin(radAngle) * (radius + 14);
        const xInner = centerX + Math.cos(radAngle) * (radius + (a % 45 === 0 ? 4 : 8));
        const yInner = centerY + Math.sin(radAngle) * (radius + (a % 45 === 0 ? 4 : 8));

        ctx.beginPath();
        ctx.moveTo(xInner, yInner);
        ctx.lineTo(xOuter, yOuter);
        ctx.lineWidth = a % 45 === 0 ? 2 : 1;
        ctx.strokeStyle = a % 45 === 0 ? '#ff5500' : 'rgba(255, 85, 0, 0.4)';
        ctx.stroke();
    }

    // 0° and 180° Dial Text
    ctx.font = '10px "Share Tech Mono"';
    ctx.fillStyle = '#ff5500';
    ctx.fillText('0°', centerX - radius - 18, centerY + 5);
    ctx.fillText('180°', centerX + radius + 4, centerY + 5);

    // Filled Value Arc
    const currentRad = Math.PI + (angle / 180) * Math.PI;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, Math.PI, currentRad, false);
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#ff5500';
    ctx.shadowColor = '#ff5500';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Cyan Needle Line
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(currentRad);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(radius + 6, 0);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
}

function updateServoAngle(angle) {
    angle = Math.max(0, Math.min(180, Math.round(angle)));
    STATE.servoAngle = angle;

    // Send Angle to Servo on D3
    sendHardwareCommand('SERVO', angle);

    // Update Dashboard UI Readouts
    const txtEl = document.getElementById('nozzleAngleText');
    if (txtEl) txtEl.innerText = `${angle}°`;
    
    const valServo = document.getElementById('valServo');
    if (valServo) valServo.innerText = `${angle}°`;
    
    const barServo = document.getElementById('barServo');
    if (barServo) barServo.style.width = `${(angle / 180) * 100}%`;

    const slider = document.getElementById('servoSlider');
    if (slider) slider.value = angle;

    drawGaugeArc(angle);
    updateTicksBar(angle);
}

function buildCustomTicks() {
    const container = document.getElementById('customTicksBar');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i <= 30; i++) {
        const tick = document.createElement('div');
        tick.className = 'tick-mark';
        tick.dataset.index = i;
        container.appendChild(tick);
    }
}

function updateTicksBar(angle) {
    const activeIdx = Math.round((angle / 180) * 30);
    const ticks = document.querySelectorAll('.tick-mark');
    ticks.forEach((tick, idx) => {
        if (idx <= activeIdx) {
            tick.classList.add('active-tick');
        } else {
            tick.classList.remove('active-tick');
        }
    });
}

// ================= 4. SECTOR RADAR ANIMATION =================
let radarSweepAngle = 0;
function animateRadar() {
    const canvas = document.getElementById('radarCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 12;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Concentric Grid Rings
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(centerX, centerY, (radius / 3) * i, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Crosshair Lines
    ctx.beginPath();
    ctx.moveTo(centerX - radius, centerY);
    ctx.lineTo(centerX + radius, centerY);
    ctx.moveTo(centerX, centerY - radius);
    ctx.lineTo(centerX, centerY + radius);
    ctx.stroke();

    // Radar Sweep Line
    radarSweepAngle += 0.025;
    const sweepX = centerX + Math.cos(radarSweepAngle) * radius;
    const sweepY = centerY + Math.sin(radarSweepAngle) * radius;

    // Sweep Gradient Cone
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, radarSweepAngle - 0.35, radarSweepAngle, false);
    ctx.closePath();
    const grad = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    grad.addColorStop(0, 'rgba(0, 240, 255, 0.2)');
    grad.addColorStop(1, 'rgba(0, 240, 255, 0.02)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Sweep Line
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(sweepX, sweepY);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Radar Targets
    const targets = [
        { r: 0.5 * radius, a: 1.2 },
        { r: 0.75 * radius, a: 3.8 }
    ];

    targets.forEach(t => {
        const tx = centerX + Math.cos(t.a) * t.r;
        const ty = centerY + Math.sin(t.a) * t.r;
        ctx.beginPath();
        ctx.arc(tx, ty, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#ff5500';
        ctx.shadowColor = '#ff5500';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    requestAnimationFrame(animateRadar);
}

// ================= 5. MOTOR CONTROLS =================
function setMotorDirection(dir) {
    if (STATE.motorDirection === dir) return;
    STATE.motorDirection = dir;

    // Send Motor Steering Command to L298N
    sendHardwareCommand(dir);

    logTerminal('CONTROL', `EXECUTING: ${dir}`);

    // Update D-Pad Active Highlights
    document.querySelectorAll('.dpad-btn').forEach(btn => btn.classList.remove('active-pressed'));

    const btnMap = {
        'FORWARD': 'btnUp',
        'BACKWARD': 'btnDown',
        'LEFT': 'btnLeft',
        'RIGHT': 'btnRight',
        'STOP': 'btnStop'
    };

    if (btnMap[dir]) {
        const targetBtn = document.getElementById(btnMap[dir]);
        if (targetBtn) targetBtn.classList.add('active-pressed');
    }
}

// ================= 6. EVENT BINDINGS & INITIALIZATION =================
window.addEventListener('DOMContentLoaded', () => {
    startHeaderClock();
    buildCustomTicks();
    updateServoAngle(80);
    animateRadar();
// Mode Toggle Event Listeners
const btnManual = document.getElementById('btnManualMode');
const btnAuto = document.getElementById('btnAutoMode');

if (btnManual && btnAuto) {
    btnManual.onclick = () => {
        btnManual.classList.add('active');
        btnAuto.classList.remove('active');
        sendHardwareCommand('MODE_MANUAL');
        logTerminal('SYS', 'SYSTEM MODE: MANUAL OVERRIDE ENGAGED');
    };

    btnAuto.onclick = () => {
        btnAuto.classList.add('active');
        btnManual.classList.remove('active');
        sendHardwareCommand('MODE_AUTO');
        logTerminal('SYS', 'SYSTEM MODE: AUTONOMOUS FLAME HUNTING ACTIVE');
    };
}
    // Terminal Initialization Logs
    logTerminal('SYS', 'Initialization sequence complete.');
    logTerminal('SYS', 'WiFi Module Target: 10.95.188.187.');
    logTerminal('SYS', 'Awaiting Control commands...');

    // D-Pad Button Clicks
    const btnUp = document.getElementById('btnUp');
    const btnDown = document.getElementById('btnDown');
    const btnLeft = document.getElementById('btnLeft');
    const btnRight = document.getElementById('btnRight');
    const btnStop = document.getElementById('btnStop');

    if (btnUp) btnUp.onclick = () => setMotorDirection('FORWARD');
    if (btnDown) btnDown.onclick = () => setMotorDirection('BACKWARD');
    if (btnLeft) btnLeft.onclick = () => setMotorDirection('LEFT');
    if (btnRight) btnRight.onclick = () => setMotorDirection('RIGHT');
    if (btnStop) btnStop.onclick = () => setMotorDirection('STOP');

    // Servo Step Buttons
    const btnRotateLeft = document.getElementById('btnRotateLeft');
    const btnRotateRight = document.getElementById('btnRotateRight');

    if (btnRotateLeft) btnRotateLeft.onclick = () => updateServoAngle(STATE.servoAngle - 10);
    if (btnRotateRight) btnRotateRight.onclick = () => updateServoAngle(STATE.servoAngle + 10);

    // Servo Slider Drag Input
    const slider = document.getElementById('servoSlider');
    if (slider) {
        slider.oninput = (e) => updateServoAngle(parseFloat(e.target.value));
    }

    // Pump Toggle Logic
    const btnPump = document.getElementById('btnPumpToggle');
    const pumpStatusLabel = document.getElementById('pumpStatusLabel');

    if (btnPump) {
        btnPump.onclick = () => {
            STATE.pumpActive = !STATE.pumpActive;

            if (STATE.pumpActive) {
                btnPump.innerText = 'DISENGAGE PUMP';
                btnPump.classList.add('pump-active');
                if (pumpStatusLabel) {
                    pumpStatusLabel.innerText = 'PUMP ACTIVE // FLOWING';
                    pumpStatusLabel.style.color = '#00f0ff';
                    pumpStatusLabel.style.borderColor = '#00f0ff';
                }
                sendHardwareCommand('PUMP_ON');
                logTerminal('SYS', 'HIGH-PRESSURE WATER PUMP: ACTIVATED');
            } else {
                btnPump.innerText = 'ENGAGE PUMP';
                btnPump.classList.remove('pump-active');
                if (pumpStatusLabel) {
                    pumpStatusLabel.innerText = 'SYSTEM READY';
                    pumpStatusLabel.style.color = '#8298ac';
                    pumpStatusLabel.style.borderColor = 'rgba(255, 85, 0, 0.2)';
                }
                sendHardwareCommand('PUMP_OFF');
                logTerminal('SYS', 'HIGH-PRESSURE WATER PUMP: DEACTIVATED');
            }
        };
    }

    // Emergency Stop Action
    const btnEStop = document.getElementById('btnEmergencyStop');
    if (btnEStop) {
        btnEStop.onclick = () => {
            setMotorDirection('STOP');
            if (STATE.pumpActive && btnPump) btnPump.click();
            logTerminal('SYS', 'EMERGENCY SHUTDOWN EXECUTED!');

            const sysStatus = document.getElementById('sysStatusText');
            if (sysStatus) {
                sysStatus.innerText = 'EMERGENCY SHUTDOWN';
                sysStatus.style.color = '#ff0033';
            }
        };
    }

    // Keyboard Bindings (WASD, Arrows, Space, Q/E)
    window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        const key = e.key.toLowerCase();

        if (key === 'w' || e.key === 'ArrowUp') setMotorDirection('FORWARD');
        else if (key === 's' || e.key === 'ArrowDown') setMotorDirection('BACKWARD');
        else if (key === 'a' || e.key === 'ArrowLeft') setMotorDirection('LEFT');
        else if (key === 'd' || e.key === 'ArrowRight') setMotorDirection('RIGHT');
        else if (e.key === ' ') {
            e.preventDefault();
            setMotorDirection('STOP');
        } else if (key === 'q') updateServoAngle(STATE.servoAngle - 10);
        else if (key === 'e') updateServoAngle(STATE.servoAngle + 10);
    });

    window.addEventListener('keyup', (e) => {
        const keys = ['w', 'a', 's', 'd', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
        if (keys.includes(e.key) || keys.includes(e.key.toLowerCase())) {
            if (STATE.motorDirection !== 'STOP') setMotorDirection('STOP');
        }
    });
});