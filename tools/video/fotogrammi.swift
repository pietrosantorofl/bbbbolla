import AVFoundation
import AppKit
// uso: fotogrammi <video> <out.jpg> <n>  -> contact sheet di n fotogrammi
let a = CommandLine.arguments
let asset = AVURLAsset(url: URL(fileURLWithPath: a[1]))
let n = Int(a[3]) ?? 12
let dur = CMTimeGetSeconds(asset.duration)
let gen = AVAssetImageGenerator(asset: asset)
gen.appliesPreferredTrackTransform = true
gen.maximumSize = CGSize(width: 360, height: 360)
gen.requestedTimeToleranceBefore = .zero; gen.requestedTimeToleranceAfter = .zero
var imgs: [CGImage] = []
for i in 0..<n {
  let t = CMTime(seconds: dur * (Double(i) + 0.5) / Double(n), preferredTimescale: 600)
  if let im = try? gen.copyCGImage(at: t, actualTime: nil) { imgs.append(im) }
}
let w = imgs[0].width, h = imgs[0].height, cols = 6
let rows = (imgs.count + cols - 1) / cols
let ctx = CGContext(data: nil, width: w*cols, height: h*rows, bitsPerComponent: 8, bytesPerRow: 0, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
for (i, im) in imgs.enumerated() { ctx.draw(im, in: CGRect(x: (i%cols)*w, y: (rows-1-i/cols)*h, width: w, height: h)) }
let rep = NSBitmapImageRep(cgImage: ctx.makeImage()!)
try! rep.representation(using: .jpeg, properties: [.compressionFactor: 0.8])!.write(to: URL(fileURLWithPath: a[2]))
print("dur", dur, "frames", imgs.count, w, h)
