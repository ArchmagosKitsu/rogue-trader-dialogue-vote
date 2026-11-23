param([Parameter(Mandatory)][string]$GameDir, [string]$UmmDll = "$env:USERPROFILE\AppData\LocalLow\Owlcat Games\Warhammer 40000 Rogue Trader\UnityModManager\UnityModManager.dll")
$ErrorActionPreference = 'Stop'
$m = Join-Path $GameDir 'WH40KRT_Data\Managed'
$refs = @(Get-ChildItem $m -Filter *.dll | Where-Object Name -notmatch '^System.Private.CoreLib')
$argsList = @('/nologo','/target:library','/nostdlib+',('/out:' + (Join-Path $PSScriptRoot 'FoxForgeVote.dll')),('/reference:' + $UmmDll))
foreach ($ref in $refs) { $argsList += '/reference:' + $ref.Name }
$rsp = [IO.Path]::GetTempFileName()
try {
  $lines = @($argsList + (Join-Path $PSScriptRoot 'Entry.cs') | ForEach-Object { '"' + $_ + '"' })
  [IO.File]::WriteAllLines($rsp,$lines)
  Push-Location $m
  & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /noconfig "@$rsp"
  if ($LASTEXITCODE) { throw 'Compilation failed' }
} finally { Remove-Item -LiteralPath $rsp }

