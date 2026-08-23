<#
    Deploy Keystone Loadout to ZimaOS.

    Two halves, because the server is reachable two different ways:
      1. FILES  — Z:\ is the box's /DATA, bridged locally, so copying is a plain file
                  copy. Nothing is uploaded and no SSH is involved.
      2. RUN    — Docker has to be told to rebuild, which needs a shell on the box.

    Usage:
      .\deploy.ps1              copy changed files, rebuild, restart
      .\deploy.ps1 -Setup       first run: also migrate the database and sync game data
      .\deploy.ps1 -NoBuild     copy and restart only, skipping the image rebuild
#>
[CmdletBinding()]
param(
    [switch]$Setup,
    [switch]$NoBuild
)

$ErrorActionPreference = 'Stop'

$Local     = $PSScriptRoot
$ShareRoot = 'Z:\AppData\keystone-loadout'
$BoxRoot   = '/DATA/AppData/keystone-loadout'
$Port      = 8095
$Host_     = '192.168.50.94'
# Somewhere writable; / is read-only on ZimaOS. See Invoke-Box.
$DockerConfig = '/DATA/AppData/.docker'

# Never copied. node_modules and .next are built inside the image for the server's own
# architecture, and `data` is the live database — copying the local one over it would
# overwrite the server's with whatever happens to be on this PC.
#
# .env.local is excluded separately below, via /XF rather than /XD: it is placed once and
# then left alone. Under /MIR it would otherwise be deleted from the server the moment it
# stopped existing locally, taking the Blizzard credentials with it.
$Exclude = @('node_modules', '.next', '.git', 'data', 'planning', '.claude')

function Say($msg, $colour = 'Cyan') { Write-Host "  $msg" -ForegroundColor $colour }

if (-not (Test-Path 'Z:\')) {
    throw "Z:\ is not available. The ZimaOS share must be mounted before deploying."
}

# --- 1. Files -------------------------------------------------------------------
Say "Copying source to $ShareRoot ..."
if (-not (Test-Path $ShareRoot)) { New-Item -ItemType Directory -Path $ShareRoot -Force | Out-Null }

# /MIR mirrors, so files deleted locally are deleted on the server too — otherwise a
# renamed file lingers there forever and the image keeps building from the stale copy.
$roboArgs = @(
    $Local, $ShareRoot,
    '/MIR', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:2',
    '/XD'
) + $Exclude + @('/XF', '.env.local')

robocopy @roboArgs | Out-Null

# Robocopy exit codes below 8 are success; 8+ is a real failure. Anything else would
# make `$LASTEXITCODE` look like an error to the caller.
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }
Say "Files in place." 'Green'

# The compose file the server uses is the ZimaOS one, under its conventional name.
Copy-Item (Join-Path $Local 'docker-compose.zimaos.yml') (Join-Path $ShareRoot 'docker-compose.yml') -Force

# Seeded once, never mirrored — see the /XF note above.
$RemoteEnv = Join-Path $ShareRoot '.env.local'
if (-not (Test-Path $RemoteEnv)) {
    $LocalEnv = Join-Path $Local '.env.local'
    if (-not (Test-Path $LocalEnv)) {
        throw "No .env.local here or on the server. It holds the Blizzard credentials; " +
              "create it locally or place it in $ShareRoot before deploying."
    }
    Copy-Item $LocalEnv $RemoteEnv
    Say "Seeded .env.local on the server (not touched by later deploys)." 'Yellow'
}

# --- 2. Run ---------------------------------------------------------------------
function Invoke-Box([string]$Command) {
    # zima_ssh.py reads a command from stdin and runs it over SSH (paramiko). Used rather
    # than `ssh` because OpenSSH would prompt for a password interactively, and nothing
    # in an automated deploy has a keyboard attached.
    #
    # DOCKER_CONFIG is redirected because ZimaOS mounts / read-only: the Docker CLI tries
    # to create /root/.docker on first use, and the command dies with "read-only file
    # system" before Docker is even contacted.
    $wrapped = "export DOCKER_CONFIG='$DockerConfig'; mkdir -p '$DockerConfig'; $Command"

    # zima_ssh.py always exits 0 itself — it reports the REMOTE exit status by printing
    # "--EXIT n--" on stderr. Reading $LASTEXITCODE here meant a failed build was
    # reported as a successful deploy, which is precisely the wrong way round.
    $env:PYTHONIOENCODING = 'utf-8'   # Next prints a unicode triangle; cp1252 stdout throws on it.
    $out = $wrapped | & python 'Z:\zima_ssh.py' 2>&1 | Out-String
    Write-Host $out.TrimEnd()

    if ($out -notmatch '--EXIT\s+0--') {
        throw "Remote command failed: $Command"
    }
}

if ($NoBuild) {
    Say "Restarting container (no rebuild) ..."
    Invoke-Box "cd $BoxRoot && docker compose up -d"
} else {
    Say "Building on the server — first run takes several minutes (better-sqlite3 compiles from source) ..."
    Invoke-Box "cd $BoxRoot && docker compose up -d --build"
}

if ($Setup) {
    # The image chowns /app/data at build time, but the bind mount replaces that with the
    # host's ownership at runtime, so the container user (1001) cannot create the
    # database. Without this the migration "succeeds" and writes nothing.
    Say "Granting the container write access to the data volume ..."
    Invoke-Box "chown -R 1001:1001 $BoxRoot/data"

    Say "Creating the database schema ..."
    Invoke-Box "cd $BoxRoot && docker compose exec -T keystone-loadout npx drizzle-kit migrate"

    # Not run inline: zima_ssh.py caps a command at 300s and the loot sync alone takes
    # ~560s, so the channel times out and takes the visible progress with it. Started
    # detached and polled instead.
    Say "Syncing game data — around 10 minutes. Polling ..."
    Invoke-Box "cd $BoxRoot && nohup sh -c 'cd $BoxRoot && DOCKER_CONFIG=$DockerConfig docker compose exec -T keystone-loadout npm run sync:all > /tmp/sync.log 2>&1; echo DONE >> /tmp/sync.log' > /dev/null 2>&1 & echo started"

    $deadline = (Get-Date).AddMinutes(20)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 30
        $log = "tail -1 /tmp/sync.log" | & python 'Z:\zima_ssh.py' 2>&1 | Out-String
        if ($log -match 'DONE') { break }
        Say "  ... still syncing" 'DarkGray'
    }

    Invoke-Box "grep -E 'OK —|Error' /tmp/sync.log | tail -6"
}

Say "Done. http://${Host_}:${Port}" 'Green'
