#import <Foundation/Foundation.h>
#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import <VisionCamera/Frame.h>

#if __has_include("VisionOcr/VisionOcr-Swift.h")
#import "VisionOcr/VisionOcr-Swift.h"
#else
#import "VisionOcr-Swift.h"
#endif

// A handwritten +load category, not the VISION_EXPORT_SWIFT_FRAME_PROCESSOR
// macro (which registers via __attribute__((constructor)) instead) — a real
// device test (2026-09-13) found the macro's constructor never actually ran
// ("Can't load the visionScanText frame processor plugin"), even though the
// Xcode build log confirmed the pod compiled and linked correctly. This
// mirrors the exact pattern the previous ML Kit plugin used successfully in
// this same project, for the same kind of Swift FrameProcessorPlugin
// subclass: +load is a real Objective-C runtime method, guaranteed to run
// when the category loads, rather than relying on linker-level constructor-
// section support inside a static library.
@interface VisionOcrFrameProcessorPlugin (FrameProcessorPluginLoader)
@end

@implementation VisionOcrFrameProcessorPlugin (FrameProcessorPluginLoader)
+ (void)load {
  [FrameProcessorPluginRegistry addFrameProcessorPlugin:@"visionScanText"
                                        withInitializer:^FrameProcessorPlugin*(VisionCameraProxyHolder* proxy, NSDictionary* options) {
                                          return [[VisionOcrFrameProcessorPlugin alloc] initWithProxy:proxy withOptions:options];
                                        }];
}
@end
