#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(VisionOcrPhotoModule, NSObject)

RCT_EXTERN_METHOD(recognize:(NSString *)uri
                  withResolver:(RCTPromiseResolveBlock)resolve
                  withRejecter:(RCTPromiseRejectBlock)reject)

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

@end
