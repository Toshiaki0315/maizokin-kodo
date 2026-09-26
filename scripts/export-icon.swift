// アプリアイコンの原本（SVG）を 1024×1024 の PNG に書き出す（仕様 16.11）。
// macOS 標準の画像の仕組み（NSImage）で SVG を読むため、追加の道具は要らない。
// 使い方：swift scripts/export-icon.swift src-tauri/icons/source/app-icon.svg src-tauri/icons/source/app-icon.png
// その後：npm run tauri icon src-tauri/icons/source/app-icon.png
import AppKit

let args = CommandLine.arguments
guard args.count == 3 else {
  print("使い方: swift scripts/export-icon.swift <入力.svg> <出力.png>")
  exit(1)
}
guard let image = NSImage(contentsOf: URL(fileURLWithPath: args[1])) else {
  print("SVG を読めませんでした: \(args[1])")
  exit(1)
}
let size = 1024
let rep = NSBitmapImageRep(
  bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
  hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
rep.size = NSSize(width: size, height: size)
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
NSGraphicsContext.current?.imageInterpolation = .high
image.draw(in: NSRect(x: 0, y: 0, width: size, height: size))
NSGraphicsContext.restoreGraphicsState()
guard let png = rep.representation(using: .png, properties: [:]) else {
  print("PNG に変換できませんでした")
  exit(1)
}
try png.write(to: URL(fileURLWithPath: args[2]))
print("書き出しました: \(args[2])")
