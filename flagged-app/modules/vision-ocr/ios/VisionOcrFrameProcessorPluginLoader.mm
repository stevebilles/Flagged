#import <Foundation/Foundation.h>
#import <VisionCamera/FrameProcessorPlugin.h>
#import <VisionCamera/FrameProcessorPluginRegistry.h>
#import <VisionCamera/Frame.h>

#if __has_include("VisionOcr/VisionOcr-Swift.h")
#import "VisionOcr/VisionOcr-Swift.h"
#else
#import "VisionOcr-Swift.h"
#endif

VISION_EXPORT_SWIFT_FRAME_PROCESSOR(VisionOcrFrameProcessorPlugin, visionScanText)
