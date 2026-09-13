require "json"

package = JSON.parse(File.read(File.join(__dir__, "package.json")))

Pod::Spec.new do |s|
  s.name         = "VisionOcr"
  s.version      = package["version"]
  s.summary      = package["description"]
  s.license      = package["license"]
  s.authors      = { "Steve Billesberger" => "steverbilles@gmail.com" }
  s.homepage     = "https://github.com/stevebilles/Flagged"
  s.platforms    = { :ios => "13.4" }
  s.source       = { :path => "." }

  s.source_files = "ios/**/*.{h,m,mm,swift}"

  s.dependency "React-Core"
  s.dependency "VisionCamera"
end
