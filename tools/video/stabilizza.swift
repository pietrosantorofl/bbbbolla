// stabilizza: taglia, stabilizza (Vision), centra/zooma, migliora colore e luce, scrive H.264 + AAC per il web.
// uso: stabilizza in.mp4 out.mp4 keep=0-4.5,6-10 w=720 h=1280 fps=30 zoom=1.12 smooth=0.5 ev=0.3 shadows=0.4 sat=1.08 vib=0.15 contrast=1.04 nr=0.02 sharp=0.3 bitrate=3000000 poster=out.jpg posterAt=1.0 analyze=only
import AVFoundation
import CoreImage
import Vision
import AppKit

setvbuf(stdout, nil, _IONBF, 0)
var opt: [String: String] = [:]
let args = CommandLine.arguments
for a in args.dropFirst(3) { let p = a.split(separator: "=", maxSplits: 1); opt[String(p[0])] = p.count > 1 ? String(p[1]) : "1" }
func d(_ k: String, _ def: Double) -> Double { Double(opt[k] ?? "") ?? def }
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
let W = Int(d("w", 720)), H = Int(d("h", 1280)), FPS = d("fps", 30)
let zoom = d("zoom", 1.12), smoothSec = d("smooth", 0.5)

// ---------- composizione con i tagli ----------
let src = AVURLAsset(url: inURL)
let vt = src.tracks(withMediaType: .video)[0]
let at = src.tracks(withMediaType: .audio).first
let comp = AVMutableComposition()
let cv = comp.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let ca = at != nil ? comp.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid) : nil
var ranges: [(Double, Double)] = []
let total = CMTimeGetSeconds(src.duration)
if let k = opt["keep"] { for s in k.split(separator: ",") { let p = s.split(separator: "-"); ranges.append((Double(p[0])!, min(Double(p[1])!, total))) } } else { ranges = [(0, total)] }
var cursor = CMTime.zero
var joins: [CMTime] = []
for (a, b) in ranges {
  let r = CMTimeRange(start: CMTime(seconds: a, preferredTimescale: 6000), end: CMTime(seconds: b, preferredTimescale: 6000))
  try! cv.insertTimeRange(r, of: vt, at: cursor)
  if let at = at { try! ca!.insertTimeRange(r, of: at, at: cursor) }
  cursor = cursor + r.duration
  joins.append(cursor)
}
let outDur = CMTimeGetSeconds(cursor)

// ---------- lettura fotogrammi (orientati) ----------
let ctx = CIContext(options: [.workingColorSpace: CGColorSpace(name: CGColorSpace.sRGB)!])
func frames(_ body: (CIImage, CMTime) -> Void) {
  let r = try! AVAssetReader(asset: comp)
  let o = AVAssetReaderTrackOutput(track: cv, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA])
  o.alwaysCopiesSampleData = false
  r.add(o); r.startReading()
  var next = 0.0
  while let sb = o.copyNextSampleBuffer() {
    guard let pb = CMSampleBufferGetImageBuffer(sb) else { continue }
    let t = CMSampleBufferGetPresentationTimeStamp(sb)
    let s = CMTimeGetSeconds(t)
    if s + 0.25 / FPS < next { continue }   // riduce a FPS (es. 60 -> 30)
    next = max(next + 1 / FPS, s + 0.5 / FPS)
    autoreleasepool {
      var im = CIImage(cvPixelBuffer: pb); if opt["orient"] != "0" { im = im.oriented(.right) }
      im = im.transformed(by: CGAffineTransform(translationX: -im.extent.minX, y: -im.extent.minY))
      body(im, t)
    }
  }
}

// ---------- analisi del movimento ----------
struct M { var dx = 0.0, dy = 0.0, da = 0.0 }
var motions: [M] = []
var times: [CMTime] = []
var srcW = 0.0, srcH = 0.0
let AW = 270.0
var prevSmall: CIImage? = nil
frames { im, t in
  srcW = Double(im.extent.width); srcH = Double(im.extent.height)
  let s = AW / srcW
  let small = im.transformed(by: CGAffineTransform(scaleX: s, y: s))
  let cg = ctx.createCGImage(small, from: small.extent)!
  var m = M()
  if let p = prevSmall {
    let pcg = ctx.createCGImage(p, from: p.extent)!
    let h = VNImageRequestHandler(cgImage: pcg, options: [:])
    let rq = VNHomographicImageRegistrationRequest(targetedCGImage: cg, options: [:])
    let rt = VNTranslationalImageRegistrationRequest(targetedCGImage: cg, options: [:])
    try? h.perform([rq, rt])
    var ok = false
    if let o = rq.results?.first as? VNImageHomographicAlignmentObservation {
      let w = o.warpTransform   // colonne
      let a = Double(w.columns.0.x), b = Double(w.columns.0.y), tx = Double(w.columns.2.x), ty = Double(w.columns.2.y)
      let ang = atan2(b, a), sc = sqrt(a * a + b * b)
      let persp = abs(Double(w.columns.0.z)) + abs(Double(w.columns.1.z))
      if opt["homo"] == "1" && abs(ang) < 0.08 && abs(sc - 1) < 0.08 && persp < 0.002 && abs(tx) < AW * 0.3 && abs(ty) < AW * 0.5 {
        // contenuto: si muove di -t; rotazione di -ang (attorno all'origine: correggo il termine di traslazione dal centro)
        let cx = AW / 2, cy = Double(small.extent.height) / 2
        let c1x = Double(w.columns.1.x), c1y = Double(w.columns.1.y)
        let tcx = a * cx + c1x * cy + tx - cx, tcy = b * cx + c1y * cy + ty - cy
        m = M(dx: -tcx / s, dy: -tcy / s, da: -ang)
        ok = true
      }
    }
    if !ok, let o = rt.results?.first as? VNImageTranslationAlignmentObservation {
      m = M(dx: -Double(o.alignmentTransform.tx) / s, dy: -Double(o.alignmentTransform.ty) / s, da: 0)
    }
  }
  // ai punti di taglio il movimento non si somma (scena nuova)
  if let last = times.last, joins.dropLast().contains(where: { CMTimeCompare($0, last) > 0 && CMTimeCompare($0, t) <= 0 }) { m = M() }
  motions.append(m); times.append(t)
  prevSmall = small
}
let n = motions.count
// traiettoria cumulata
var X = [Double](repeating: 0, count: n), Y = X, A = X
for i in 1..<n { X[i] = X[i-1] + motions[i].dx; Y[i] = Y[i-1] + motions[i].dy; A[i] = A[i-1] + motions[i].da }
// segmenti (tra i tagli) lisciati separatamente con gaussiana
var seg = [Int](repeating: 0, count: n)
for i in 0..<n { seg[i] = joins.dropLast().filter { CMTimeCompare($0, times[i]) <= 0 }.count }
func smooth(_ v: [Double], _ sigmaF: Double) -> [Double] {
  let r = Int(sigmaF * 3)
  var out = v
  for i in 0..<n {
    var s = 0.0, ws = 0.0
    for j in max(0, i - r)...min(n - 1, i + r) where seg[j] == seg[i] {
      let w = exp(-Double((j - i) * (j - i)) / (2 * sigmaF * sigmaF)); s += w * v[j]; ws += w
    }
    out[i] = s / ws
  }
  return out
}
let sig = smoothSec * FPS
// margini consentiti dallo zoom
let mx = (srcW - srcW / zoom) / 2 * 0.92, my = (srcH - srcH / zoom) / 2 * 0.92
// lisciatura adattiva: se la correzione esce dai margini, riduco sigma
var cX = [Double](repeating: 0, count: n), cY = cX, cA = cX
var sigma = sig
// sigma fisso; dove la correzione esce dai margini (panoramiche volute) la taglio e poi la liscio, così non ci sono scatti
let sxs = smooth(X, sigma), sys = smooth(Y, sigma)
for i in 0..<n { cX[i] = max(-mx, min(mx, sxs[i] - X[i])); cY[i] = max(-my, min(my, sys[i] - Y[i])) }
cX = smooth(cX, max(1, sigma / 5)); cY = smooth(cY, max(1, sigma / 5))
for i in 0..<n { cX[i] = max(-mx, min(mx, cX[i])); cY[i] = max(-my, min(my, cY[i])) }
func jitter(_ v: [Double]) -> Double { let m = smooth(v, 0.5 * FPS); var s = 0.0; for i in 0..<n { s += (v[i] - m[i]) * (v[i] - m[i]) }; return sqrt(s / Double(n)) }
let sx = zip(X, cX).map { $0 + $1 }, sy = zip(Y, cY).map { $0 + $1 }
print(String(format: "fotogrammi %d, %.1f s, sigma %.1f, jitter x %.2f→%.2f  y %.2f→%.2f px", n, outDur, sigma, jitter(X), jitter(sx), jitter(Y), jitter(sy)))
if opt["analyze"] == "only" { exit(0) }

// ---------- filtri ----------
let ev = d("ev", 0), shadows = d("shadows", 0), sat = d("sat", 1.05), vib = d("vib", 0.1), contrast = d("contrast", 1.03)
let nr = d("nr", 0.02), sharp = d("sharp", 0.3), bright = d("bright", 0)
func look(_ im: CIImage) -> CIImage {
  var o = im
  if nr > 0 { o = o.applyingFilter("CINoiseReduction", parameters: ["inputNoiseLevel": nr, "inputSharpness": 0.4]) }
  if ev != 0 { o = o.applyingFilter("CIExposureAdjust", parameters: ["inputEV": ev]) }
  if shadows != 0 { o = o.applyingFilter("CIHighlightShadowAdjust", parameters: ["inputShadowAmount": shadows, "inputHighlightAmount": 0.9]) }
  o = o.applyingFilter("CIColorControls", parameters: ["inputSaturation": sat, "inputContrast": contrast, "inputBrightness": bright])
  if vib != 0 { o = o.applyingFilter("CIVibrance", parameters: ["inputAmount": vib]) }
  if sharp > 0 { o = o.applyingFilter("CISharpenLuminance", parameters: ["inputSharpness": sharp, "inputRadius": 1.2]) }
  return o
}

// ---------- scrittura ----------
try? FileManager.default.removeItem(at: outURL)
let wr = try! AVAssetWriter(outputURL: outURL, fileType: .mp4)
wr.shouldOptimizeForNetworkUse = true
let vin = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
  AVVideoColorPropertiesKey: [AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2, AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2, AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2],
  AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: Int(d("bitrate", 3_000_000)), AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel, AVVideoMaxKeyFrameIntervalKey: Int(FPS * 2), AVVideoExpectedSourceFrameRateKey: Int(FPS)]])
vin.expectsMediaDataInRealTime = false
let ad = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: vin, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA, kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H])
wr.add(vin)
var ain: AVAssetWriterInput? = nil
if at != nil {
  ain = AVAssetWriterInput(mediaType: .audio, outputSettings: [AVFormatIDKey: kAudioFormatMPEG4AAC, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 2, AVEncoderBitRateKey: 128000])
  ain!.expectsMediaDataInRealTime = false
  wr.add(ain!)
}
wr.startWriting(); wr.startSession(atSourceTime: .zero)

// audio: letto tutto prima (pochi MB), poi scritto alternato al video: AVAssetWriter non avanza un input se l'altro resta indietro
var audioBufs: [CMSampleBuffer] = []
if ain != nil {
  let r = try! AVAssetReader(asset: comp)
  let mix = AVMutableAudioMix()
  let p = AVMutableAudioMixInputParameters(track: ca)
  let f = CMTime(seconds: 0.06, preferredTimescale: 6000)
  var start = CMTime.zero
  for j in joins {
    p.setVolumeRamp(fromStartVolume: 0, toEndVolume: 1, timeRange: CMTimeRange(start: start, duration: f))
    p.setVolumeRamp(fromStartVolume: 1, toEndVolume: 0, timeRange: CMTimeRange(start: j - f, duration: f))
    start = j
  }
  mix.inputParameters = [p]
  let o = AVAssetReaderAudioMixOutput(audioTracks: [ca!], audioSettings: [AVFormatIDKey: kAudioFormatLinearPCM, AVSampleRateKey: 44100, AVNumberOfChannelsKey: 2, AVLinearPCMBitDepthKey: 16, AVLinearPCMIsFloatKey: false, AVLinearPCMIsBigEndianKey: false, AVLinearPCMIsNonInterleaved: false])
  o.audioMix = mix
  r.add(o); r.startReading()
  while let sb = o.copyNextSampleBuffer() { audioBufs.append(sb) }
}
var ai = 0
var audioFinito = false
func feedAudio(upTo t: Double) {
  guard let ain = ain else { return }
  while ai < audioBufs.count && ain.isReadyForMoreMediaData && CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(audioBufs[ai])) <= t {
    ain.append(audioBufs[ai]); ai += 1
  }
  if ai == audioBufs.count && !audioFinito { ain.markAsFinished(); audioFinito = true }
}
let posterAt = d("posterAt", min(1.0, outDur / 2))
var posterDone = false
var i = 0
let outScale = Double(W) / (srcW / zoom)
frames { im, t in
  guard i < n else { return }
  let cx = srcW / 2, cy = srcH / 2
  // correzione: rotazione attorno al centro + traslazione, poi zoom al centro e ritaglio W×H
  var tr = CGAffineTransform(translationX: -cx, y: -cy)
  tr = tr.concatenating(CGAffineTransform(rotationAngle: d("sa", 0) * cA[i]))
  tr = tr.concatenating(CGAffineTransform(translationX: cx + d("sx", 1) * cX[i], y: cy + d("sy", 1) * cY[i]))
  tr = tr.concatenating(CGAffineTransform(translationX: -cx, y: -cy))
  tr = tr.concatenating(CGAffineTransform(scaleX: outScale, y: outScale))
  tr = tr.concatenating(CGAffineTransform(translationX: Double(W) / 2, y: Double(H) / 2))
  let g = im.clampedToExtent().transformed(by: tr).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))
  let out = look(g).cropped(to: CGRect(x: 0, y: 0, width: W, height: H))
  var waited = 0
  while !vin.isReadyForMoreMediaData { feedAudio(upTo: CMTimeGetSeconds(t) + 1); Thread.sleep(forTimeInterval: 0.001); waited += 1
    if waited == 2000 { print("attesa: frame", i, CMTimeGetSeconds(t), "audio", ai, audioBufs.count, ai < audioBufs.count ? CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(audioBufs[ai])) : -1, ain?.isReadyForMoreMediaData as Any, wr.status.rawValue, wr.error as Any) } }
  feedAudio(upTo: CMTimeGetSeconds(t) + 0.5)
  var pb: CVPixelBuffer? = nil
  CVPixelBufferPoolCreatePixelBuffer(nil, ad.pixelBufferPool!, &pb)
  ctx.render(out, to: pb!, bounds: out.extent, colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!)
  ad.append(pb!, withPresentationTime: t)
  if !posterDone && CMTimeGetSeconds(t) >= posterAt, let p = opt["poster"] {
    let cg = ctx.createCGImage(out, from: out.extent)!
    try! NSBitmapImageRep(cgImage: cg).representation(using: .jpeg, properties: [.compressionFactor: 0.82])!.write(to: URL(fileURLWithPath: p))
    posterDone = true
  }
  i += 1
}
vin.markAsFinished()
if let ain = ain {
  while ai < audioBufs.count { if ain.isReadyForMoreMediaData { ain.append(audioBufs[ai]); ai += 1 } else { Thread.sleep(forTimeInterval: 0.001) } }
  if !audioFinito { ain.markAsFinished() }
}

let sem = DispatchSemaphore(value: 0)
wr.finishWriting { sem.signal() }
sem.wait()
if wr.status != .completed { print("ERRORE", wr.error as Any); exit(1) }
let sz = (try? FileManager.default.attributesOfItem(atPath: outURL.path)[.size] as? Int) ?? 0
print(String(format: "scritto %@ %.1f MB", outURL.lastPathComponent, Double(sz) / 1e6))
