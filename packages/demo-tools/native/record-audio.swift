// Lists the audio inputs, or records one to a WAV file until Enter is pressed or a time limit passes.
//
//   record-audio list
//   record-audio record <microphone name, or "" for the default input> <output.wav> <seconds>
//
// It captures through AVFoundation, because ffmpeg's avfoundation input drops buffers on macOS, which leaves clicks
// in the recording. The limit counts from the first captured audio, since a Continuity microphone takes seconds to
// connect.
import AVFoundation

let arguments = CommandLine.arguments
let discovery = AVCaptureDevice.DiscoverySession(
  deviceTypes: [.microphone, .external], mediaType: .audio, position: .unspecified)

func fail(_ message: String, code: Int32 = 1) -> Never {
  FileHandle.standardError.write("\(message)\n".data(using: .utf8)!)
  exit(code)
}

if arguments.count == 2 && arguments[1] == "list" {
  for device in discovery.devices { print(device.localizedName) }
  exit(0)
}

guard arguments.count == 5, arguments[1] == "record", let limit = Double(arguments[4]) else {
  fail("usage: record-audio list | record-audio record <microphone> <output.wav> <seconds>", code: 2)
}
let name = arguments[2]
let output = URL(fileURLWithPath: arguments[3])

let device: AVCaptureDevice
if name.isEmpty {
  guard let fallback = AVCaptureDevice.default(for: .audio) else { fail("no audio input is available") }
  device = fallback
} else {
  guard let match = discovery.devices.first(where: { $0.localizedName == name }) else {
    let names = discovery.devices.map { "\"\($0.localizedName)\"" }.joined(separator: ", ")
    fail("no microphone is named \"\(name)\"; the microphones are \(names)")
  }
  device = match
}

/// Reports when recording starts, arms the time limit, and exits once the file is complete.
final class RecordingDelegate: NSObject, AVCaptureFileOutputRecordingDelegate {
  let deviceName: String
  let limit: Double

  init(deviceName: String, limit: Double) {
    self.deviceName = deviceName
    self.limit = limit
  }

  func fileOutput(_ output: AVCaptureFileOutput, didStartRecordingTo url: URL, from connections: [AVCaptureConnection]) {
    FileHandle.standardError.write(
      "Recording from \"\(deviceName)\". Read now, then press Enter to stop (at most \(Int(limit)) seconds).\n"
        .data(using: .utf8)!)
    DispatchQueue.main.asyncAfter(deadline: .now() + limit) { output.stopRecording() }
  }

  func fileOutput(
    _ output: AVCaptureFileOutput, didFinishRecordingTo url: URL, from connections: [AVCaptureConnection], error: Error?
  ) {
    if let error { fail("recording failed: \(error.localizedDescription)") }
    exit(0)
  }
}

let session = AVCaptureSession()
let fileOutput = AVCaptureAudioFileOutput()
let delegate = RecordingDelegate(deviceName: device.localizedName, limit: limit)
do {
  session.addInput(try AVCaptureDeviceInput(device: device))
} catch {
  fail("cannot open \"\(device.localizedName)\": \(error.localizedDescription)")
}
session.addOutput(fileOutput)
session.startRunning()
try? FileManager.default.removeItem(at: output)
fileOutput.startRecording(to: output, outputFileType: .wav, recordingDelegate: delegate)

DispatchQueue.global().async {
  _ = readLine()
  DispatchQueue.main.async { fileOutput.stopRecording() }
}
RunLoop.main.run()
