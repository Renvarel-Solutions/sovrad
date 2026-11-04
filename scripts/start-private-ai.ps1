param([switch]$HardLimitConfirmed)
$ErrorActionPreference = 'Stop'
if (!$HardLimitConfirmed) { throw 'Confirm the dedicated Sovrad project has a $5 enforced hard limit first.' }
if (Test-Path Env:OPENAI_API_KEY) { throw 'Use a fresh PowerShell window with no existing API key.' }
$secureKey = Read-Host 'Paste the dedicated Sovrad key (hidden)' -AsSecureString
$pointer = [IntPtr]::Zero
try {
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
  $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if (!$env:OPENAI_API_KEY -or $env:OPENAI_API_KEY.Length -lt 20) { throw 'A dedicated key is required.' }
  $env:OPENAI_MODEL = 'gpt-5.6-terra'
  $env:SOVRAD_AI_ENABLED = 'true'
  $env:SOVRAD_AI_HARD_LIMIT_CONFIRMED = 'true'
  Push-Location (Split-Path -Parent $PSScriptRoot)
  try { npm run dev:api } finally { Pop-Location }
} finally {
  Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:SOVRAD_AI_ENABLED -ErrorAction SilentlyContinue
  Remove-Item Env:SOVRAD_AI_HARD_LIMIT_CONFIRMED -ErrorAction SilentlyContinue
  Remove-Item Env:OPENAI_MODEL -ErrorAction SilentlyContinue
  if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  $secureKey.Dispose()
}
