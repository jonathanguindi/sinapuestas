// Dibuja el ícono PREMIUM de SinApuestas (escudo con check, colores de marca).
// Uso: swift makeicon.swift <tamaño> <archivo.png>
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count >= 3, let size = Int(args[1]) else { exit(1) }
let outPath = args[2]
let S = CGFloat(size)

let cs = CGColorSpaceCreateDeviceRGB()
guard let ctx = CGContext(data: nil, width: size, height: size,
                          bitsPerComponent: 8, bytesPerRow: 0, space: cs,
                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { exit(1) }

// Coordenadas tipo SVG (origen arriba-izquierda).
ctx.translateBy(x: 0, y: S); ctx.scaleBy(x: 1, y: -1)
ctx.interpolationQuality = .high
ctx.setAllowsAntialiasing(true)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: r/255, green: g/255, blue: b/255, alpha: a)
}
let teal     = rgb(14, 124, 110)
let tealLite = rgb(26, 150, 134)
let tealDeep = rgb(8, 66, 58)
// Borde del escudo: verde en otro tono (menta/esmeralda), en vez de naranja.
let dawn     = rgb(52, 211, 153)   // #34D399 esmeralda claro
let dawnDeep = rgb(16, 185, 129)   // #10B981 verde más profundo

// ---------- Fondo: cuadrado redondeado con degradado + brillo ----------
let corner = S * 0.2237
let bg = CGPath(roundedRect: CGRect(x: 0, y: 0, width: S, height: S),
                cornerWidth: corner, cornerHeight: corner, transform: nil)
ctx.saveGState(); ctx.addPath(bg); ctx.clip()
let grad = CGGradient(colorsSpace: cs, colors: [tealLite, teal, tealDeep] as CFArray,
                      locations: [0, 0.55, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: S), options: [])
// brillo radial suave arriba-centro
let glow = CGGradient(colorsSpace: cs, colors: [rgb(255,255,255,0.22), rgb(255,255,255,0)] as CFArray,
                      locations: [0, 1])!
ctx.drawRadialGradient(glow, startCenter: CGPoint(x: S*0.5, y: S*0.26), startRadius: 0,
                       endCenter: CGPoint(x: S*0.5, y: S*0.26), endRadius: S*0.6, options: [])
ctx.restoreGState()

// ---------- Escudo (espacio 24×24 del logo), centrado ----------
let frac: CGFloat = 0.62
let s = S * frac / 24.0
let tx = (S - 24 * s) / 2
let ty = (S - 24 * s) / 2 - S * 0.005
func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: tx + x * s, y: ty + y * s) }

let shield = CGMutablePath()
shield.move(to: P(12, 2))
shield.addLine(to: P(4, 5))
shield.addLine(to: P(4, 11))
shield.addCurve(to: P(12, 21.7), control1: P(4, 16), control2: P(7.4, 20.4))
shield.addCurve(to: P(20, 11), control1: P(16.6, 20.4), control2: P(20, 16))
shield.addLine(to: P(20, 5))
shield.closeSubpath()

// Sombra + relleno blanco con leve degradado (da volumen).
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -S * 0.018), blur: S * 0.05,
              color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.28))
ctx.addPath(shield); ctx.setFillColor(rgb(255,255,255)); ctx.fillPath()
ctx.restoreGState()

ctx.saveGState(); ctx.addPath(shield); ctx.clip()
let sheen = CGGradient(colorsSpace: cs, colors: [rgb(255,255,255), rgb(233,241,238)] as CFArray,
                       locations: [0, 1])!
ctx.drawLinearGradient(sheen, start: P(12, 2), end: P(12, 21.7), options: [])
// brillo superior interno del escudo
let sglow = CGGradient(colorsSpace: cs, colors: [rgb(255,255,255,0.9), rgb(255,255,255,0)] as CFArray,
                       locations: [0, 1])!
ctx.drawRadialGradient(sglow, startCenter: P(12, 7), startRadius: 0,
                       endCenter: P(12, 7), endRadius: 9*s, options: [])
ctx.restoreGState()

// Borde amanecer (dos tonos, fino y elegante).
ctx.addPath(shield); ctx.setStrokeColor(dawn); ctx.setLineWidth(0.75 * s); ctx.strokePath()
ctx.addPath(shield); ctx.setStrokeColor(dawnDeep.copy(alpha: 0.5)!); ctx.setLineWidth(0.28 * s); ctx.strokePath()

// ---------- Check verde azulado con volumen ----------
let chk = CGMutablePath()
chk.move(to: P(8.1, 12.3))
chk.addLine(to: P(10.8, 15.0))
chk.addLine(to: P(16.1, 8.9))
ctx.setLineCap(.round); ctx.setLineJoin(.round)
// sombra sutil del check
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -S*0.006), blur: S*0.012,
              color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.18))
ctx.addPath(chk); ctx.setStrokeColor(teal); ctx.setLineWidth(2.35 * s); ctx.strokePath()
ctx.restoreGState()
// degradado encima del trazo del check
ctx.saveGState()
ctx.addPath(chk); ctx.setLineWidth(2.35 * s); ctx.replacePathWithStrokedPath(); ctx.clip()
let cg = CGGradient(colorsSpace: cs, colors: [tealLite, tealDeep] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(cg, start: P(8, 9), end: P(16, 15), options: [])
ctx.restoreGState()

guard let img = ctx.makeImage() else { exit(1) }
let url = URL(fileURLWithPath: outPath) as CFURL
guard let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
