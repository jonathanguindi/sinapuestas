// Dibuja el ícono de SinApuestas (escudo con check, colores de la marca) a un
// PNG del tamaño pedido, usando las coordenadas del logo de la web.
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

// Coordenadas tipo SVG (origen arriba-izquierda, y hacia abajo).
ctx.translateBy(x: 0, y: S); ctx.scaleBy(x: 1, y: -1)

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> CGColor {
    CGColor(red: r/255, green: g/255, blue: b/255, alpha: a)
}
let teal = rgb(14, 124, 110)
let tealDeep = rgb(10, 82, 72)
let dawn = rgb(231, 161, 106)

// Fondo: cuadrado redondeado con degradado verde azulado (la marca).
let corner = S * 0.2237
let bg = CGPath(roundedRect: CGRect(x: 0, y: 0, width: S, height: S),
                cornerWidth: corner, cornerHeight: corner, transform: nil)
ctx.saveGState(); ctx.addPath(bg); ctx.clip()
let grad = CGGradient(colorsSpace: cs, colors: [teal, tealDeep] as CFArray, locations: [0, 1])!
ctx.drawLinearGradient(grad, start: CGPoint(x: 0, y: 0), end: CGPoint(x: 0, y: S), options: [])
ctx.restoreGState()

// El escudo, escalado desde el espacio 24×24 del logo y centrado.
let frac: CGFloat = 0.60
let s = S * frac / 24.0
let tx = (S - 24 * s) / 2
let ty = (S - 24 * s) / 2
func P(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: tx + x * s, y: ty + y * s) }

let shield = CGMutablePath()
shield.move(to: P(12, 2))
shield.addLine(to: P(4, 5))
shield.addLine(to: P(4, 11))
shield.addCurve(to: P(12, 21.7), control1: P(4, 16), control2: P(7.4, 20.4))
shield.addCurve(to: P(20, 11), control1: P(16.6, 20.4), control2: P(20, 16))
shield.addLine(to: P(20, 5))
shield.closeSubpath()

// Sombra suave + escudo blanco.
ctx.saveGState()
ctx.setShadow(offset: CGSize(width: 0, height: -S * 0.012), blur: S * 0.03,
              color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.18))
ctx.addPath(shield); ctx.setFillColor(rgb(255, 255, 255, 0.98)); ctx.fillPath()
ctx.restoreGState()

// Borde fino color amanecer (como el escudo del hero de la web).
ctx.addPath(shield); ctx.setStrokeColor(dawn); ctx.setLineWidth(0.7 * s); ctx.strokePath()

// Check verde azulado.
let chk = CGMutablePath()
chk.move(to: P(8.3, 12.2))
chk.addLine(to: P(10.8, 14.7))
chk.addLine(to: P(15.9, 9.2))
ctx.setLineCap(.round); ctx.setLineJoin(.round)
ctx.addPath(chk); ctx.setStrokeColor(teal); ctx.setLineWidth(2.2 * s); ctx.strokePath()

guard let img = ctx.makeImage() else { exit(1) }
let url = URL(fileURLWithPath: outPath) as CFURL
guard let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil) else { exit(1) }
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
