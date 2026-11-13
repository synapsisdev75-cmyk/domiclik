Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'Stop'
$outDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$frameDir = Join-Path $outDir 'frames'
New-Item -ItemType Directory -Force -Path $frameDir | Out-Null

function New-RoundPath([single]$x, [single]$y, [single]$w, [single]$h, [single]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90) | Out-Null
  $p.AddArc(($x + $w - $d), $y, $d, $d, 270, 90) | Out-Null
  $p.AddArc(($x + $w - $d), ($y + $h - $d), $d, $d, 0, 90) | Out-Null
  $p.AddArc($x, ($y + $h - $d), $d, $d, 90, 90) | Out-Null
  $p.CloseFigure()
  return $p
}

function Fill-Round($g, $brush, $x, $y, $w, $h, $r) {
  $p = New-RoundPath $x $y $w $h $r
  $g.FillPath($brush, $p)
  $p.Dispose()
}

function Draw-Phone($g, [string]$mode) {
  $x = 150; $y = 80; $w = 430; $h = 900
  $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 0, 0, 0))
  Fill-Round $g $shadow ($x + 14) ($y + 18) $w $h 48
  $shadow.Dispose()
  $bezel = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 18, 22, 32))
  Fill-Round $g $bezel $x $y $w $h 48
  $bezel.Dispose()
  $screen = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 245, 247, 252))
  Fill-Round $g $screen ($x + 12) ($y + 12) ($w - 24) ($h - 24) 40
  $screen.Dispose()
  return @{ X = ($x + 28); Y = ($y + 36); W = ($w - 56); H = ($h - 64); Mode = $mode }
}

$frames = @()

function Save-Frame($draw) {
  $bmp = New-Object System.Drawing.Bitmap 1920, 1080
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.TextRenderingHint = 'AntiAliasGridFit'
  $g.Clear([System.Drawing.Color]::FromArgb(255, 7, 17, 31))
  & $draw $g
  $g.Dispose()
  $n = $script:frames.Count + 1
  $path = Join-Path $frameDir ('{0:D2}.png' -f $n)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $script:frames += $path
}

$fontTitle = New-Object System.Drawing.Font ('Segoe UI', [single]40, [System.Drawing.FontStyle]::Bold)
$fontH = New-Object System.Drawing.Font ('Segoe UI', [single]28, [System.Drawing.FontStyle]::Bold)
$fontB = New-Object System.Drawing.Font ('Segoe UI', [single]22)
$fontS = New-Object System.Drawing.Font ('Segoe UI', [single]16)
$fontXS = New-Object System.Drawing.Font ('Segoe UI', [single]14)
$white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$muted = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 186, 198, 216))
$ink = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
$orange = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 234, 88, 12))
$green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 5, 150, 105))
$cyan = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 8, 145, 178))
$card = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
$soft = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 255, 247, 237))
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = 'Near'
$sf.LineAlignment = 'Near'

function Caption($g, [string]$step, [string]$title, [string]$body, [string]$en) {
  $g.DrawString($step, $fontS, $cyan, 680, 120)
  $rectT = New-Object System.Drawing.RectangleF 680, 160, 1100, 160
  $g.DrawString($title, $fontTitle, $white, $rectT, $sf)
  $rectB = New-Object System.Drawing.RectangleF 680, 360, 1080, 280
  $g.DrawString($body, $fontB, $muted, $rectB, $sf)
  $rectE = New-Object System.Drawing.RectangleF 680, 860, 1080, 120
  $g.DrawString($en, $fontS, $cyan, $rectE, $sf)
}

function Map-Panel($g, $x, $y, $w, $h, $t) {
  $map = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 226, 232, 240))
  Fill-Round $g $map $x $y $w $h 18
  $map.Dispose()
  $road = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 148, 163, 184), 10)
  $road.StartCap = 'Round'
  $road.EndCap = 'Round'
  $pts = @(
    (New-Object System.Drawing.PointF ($x + 30), ($y + $h - 40)),
    (New-Object System.Drawing.PointF ($x + 80), ($y + $h - 140)),
    (New-Object System.Drawing.PointF ($x + 150), ($y + $h - 160)),
    (New-Object System.Drawing.PointF ($x + 190), ($y + 120)),
    (New-Object System.Drawing.PointF ($x + $w - 40), ($y + 70))
  )
  $g.DrawLines($road, $pts)
  $road.Dispose()
  $i = [Math]::Min(3, [Math]::Floor($t * 4))
  $a = $pts[$i]; $b = $pts[$i + 1]
  $u = ($t * 4) - $i
  $px = $a.X + ($b.X - $a.X) * $u
  $py = $a.Y + ($b.Y - $a.Y) * $u
  $pin = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 234, 88, 12))
  $g.FillEllipse($pin, ($px - 14), ($py - 14), 28, 28)
  $pin.Dispose()
  $core = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
  $g.FillEllipse($core, ($px - 6), ($py - 6), 12, 12)
  $core.Dispose()
}

# 1 Title
Save-Frame {
  param($g)
  $g.DrawString('DOMICLICK', $fontS, $cyan, 150, 280)
  $g.DrawString("Ubicacion durante la entrega", $fontTitle, $white, 150, 330)
  $rect = New-Object System.Drawing.RectangleF 150, 430, 1500, 200
  $g.DrawString("El transportista inicia el turno. La ubicacion precisa sigue activa con la pantalla bloqueada, siempre con una notificacion visible, para que el cliente y la torre vean la moto en la calle.", $fontB, $muted, $rect, $sf)
  $g.DrawString('Google Play declaration: foreground location while a delivery shift is open. The user always sees the notification.', $fontS, $cyan, 150, 700)
}

# 2 Disclosure inside the app, before the permission
Save-Frame {
  param($g)
  $p = Draw-Phone $g 'd'
  $g.DrawString('CABINA DELIVERY', $fontXS, $cyan, $p.X, ($p.Y + 8))
  $g.DrawString('transportista', $fontH, $ink, $p.X, ($p.Y + 32))
  $g.DrawString('Placa ABC-12C  -  En turno', $fontXS, $muted, $p.X, ($p.Y + 78))
  Fill-Round $g $soft ($p.X) ($p.Y + 130) $p.W 430 18
  $g.DrawString('Aviso destacado', $fontXS, $orange, ($p.X + 18), ($p.Y + 148))
  $box = New-Object System.Drawing.RectangleF ($p.X + 18), ($p.Y + 180), ($p.W - 36), 280
  $g.DrawString("DomiClick recoge tu ubicacion precisa en segundo plano mientras el turno esta abierto, aunque bloquees la pantalla o uses otra app. Sirve solo para mostrar la entrega en vivo al cliente y a la torre. Veras siempre la notificacion DomiClick localizador. Al salir del turno, se apaga.", $fontS, $ink, $box, $sf)
  Fill-Round $g $orange ($p.X) ($p.Y + 590) $p.W 64 16
  $g.DrawString('Entendido, continuar', $fontB, $white, ($p.X + 70), ($p.Y + 604))
  Caption $g '1 - Aviso en la app' 'El repartidor lee el aviso antes del permiso' 'El texto dice para que se usa la ubicacion, que sigue con la pantalla bloqueada y que se apaga al salir del turno.' 'Prominent in-app disclosure, shown before the system permission.'
}

# 3 System permission
Save-Frame {
  param($g)
  $p = Draw-Phone $g 'p'
  $dim = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 15, 23, 42))
  $g.FillRectangle($dim, ($p.X - 8), ($p.Y - 8), ($p.W + 16), ($p.H + 16))
  $dim.Dispose()
  Fill-Round $g $card ($p.X + 8) ($p.Y + 180) ($p.W - 16) 420 20
  $g.DrawString('Permiso de ubicacion', $fontXS, $cyan, ($p.X + 28), ($p.Y + 200))
  $box = New-Object System.Drawing.RectangleF ($p.X + 28), ($p.Y + 236), ($p.W - 56), 140
  $g.DrawString('Permitir que DomiClick use la ubicacion de este telefono?', $fontB, $ink, $box, $sf)
  Fill-Round $g $green ($p.X + 28) ($p.Y + 400) ($p.W - 56) 52 12
  $g.DrawString('Mientras se usa la app', $fontS, $white, ($p.X + 48), ($p.Y + 414))
  $g.DrawString('Solo esta vez', $fontS, $ink, ($p.X + 48), ($p.Y + 470))
  $g.DrawString('No permitir', $fontS, $ink, ($p.X + 48), ($p.Y + 516))
  Caption $g '2 - El usuario acepta' 'Acepta la ubicacion precisa al iniciar el turno' 'Sin ese permiso no se abre el localizador. La app no rastrea fuera del turno.' 'The courier accepts precise location. Tracking does not start without this choice.'
}

# 4 Notification while app is open
Save-Frame {
  param($g)
  $p = Draw-Phone $g 'n'
  $bar = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
  $g.FillRectangle($bar, ($p.X - 8), $p.Y, ($p.W + 16), 92)
  $bar.Dispose()
  $g.DrawString('DomiClick localizador', $fontS, $white, ($p.X + 8), ($p.Y + 16))
  $g.DrawString('En movimiento. Torre en vivo.', $fontXS, $muted, ($p.X + 8), ($p.Y + 48))
  $g.DrawString('CABINA', $fontXS, $cyan, $p.X, ($p.Y + 120))
  $g.DrawString('Pedido en camino', $fontH, $ink, $p.X, ($p.Y + 148))
  Map-Panel $g $p.X ($p.Y + 220) $p.W 360 0.35
  $g.DrawString('Pantalla activa. El aviso ya esta fijo.', $fontXS, $muted, $p.X, ($p.Y + 600))
  Caption $g '3 - Notificacion permanente' 'El usuario siempre ve que el GPS esta activo' 'La notificacion dice DomiClick localizador y si va en movimiento o detenido. No hay rastreo oculto.' 'A persistent notification stays visible for the whole shift.'
}

# 5 Locked screen, pin still moves — several frames
foreach ($t in 0.15, 0.35, 0.55, 0.75, 0.92) {
  $progress = $t
  Save-Frame {
    param($g)
    $p = Draw-Phone $g 'lock'
    $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
    $g.FillRectangle($bg, ($p.X - 10), ($p.Y - 8), ($p.W + 20), ($p.H + 16))
    $bg.Dispose()
    $g.DrawString('22:41', $fontTitle, $white, ($p.X + 110), ($p.Y + 70))
    $g.DrawString('Pantalla bloqueada', $fontS, $muted, ($p.X + 90), ($p.Y + 140))
    Fill-Round $g $card ($p.X + 6) ($p.Y + 230) ($p.W - 12) 110 16
    $g.DrawString('DomiClick localizador', $fontS, $ink, ($p.X + 24), ($p.Y + 250))
    $g.DrawString('En movimiento. Torre en vivo.', $fontXS, $muted, ($p.X + 24), ($p.Y + 286))
    Caption $g '4 - Pantalla bloqueada' 'La entrega sigue en el mapa' 'El celular esta bloqueado y la notificacion permanece. El cliente ve el pin moverse por la calle.' 'Screen is locked. The foreground notification remains and the live pin keeps moving.'
    Map-Panel $g 980 620 560 220 $progress
  }.GetNewClosure()
}

# 6 Shift ends
Save-Frame {
  param($g)
  $p = Draw-Phone $g 'end'
  $g.DrawString('CABINA DELIVERY', $fontXS, $cyan, $p.X, ($p.Y + 8))
  $g.DrawString('transportista', $fontH, $ink, $p.X, ($p.Y + 32))
  $g.DrawString('Placa ABC-12C  -  En pausa', $fontXS, $muted, $p.X, ($p.Y + 78))
  Fill-Round $g $green ($p.X) ($p.Y + 150) $p.W 64 16
  $g.DrawString('Entrada al turno', $fontB, $white, ($p.X + 90), ($p.Y + 164))
  $g.DrawString('Turno cerrado. Localizador apagado.', $fontS, $ink, $p.X, ($p.Y + 250))
  Caption $g '5 - Fin del turno' 'La ubicacion se apaga al salir' 'Cuando marca la salida del turno, DomiClick deja de enviar la posicion. No se usa fuera de una entrega activa.' 'Location stops when the shift ends. It is not used outside an active delivery.'
}

$fontTitle.Dispose(); $fontH.Dispose(); $fontB.Dispose(); $fontS.Dispose(); $fontXS.Dispose()
$white.Dispose(); $muted.Dispose(); $ink.Dispose(); $orange.Dispose(); $green.Dispose(); $cyan.Dispose(); $card.Dispose(); $soft.Dispose(); $sf.Dispose()
Write-Output ("FRAMES " + $frames.Count)
