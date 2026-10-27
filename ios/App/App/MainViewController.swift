import UIKit
import Capacitor

/// Bridge view controller of Main.storyboard. Registers the app's local
/// plugins, which npm packages would otherwise do through Package.swift.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GalleryScanPlugin())
        bridge?.registerPluginInstance(LiveSpaceMediaPlugin())
    }
}
