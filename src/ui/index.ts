/**
 * UI Components Export for terX
 *
 * Central export point for all UI components
 */

// Dialogs and base components
export { showDialog, showConfirm, theme, githubIcon, lockIcon, eyeIcon, eyeOffIcon, inputClasses, labelClasses, buttonPrimaryClasses, buttonSecondaryClasses, buttonDangerClasses, buttonGhostClasses } from "./dialogs";

// Storage mode selector
export { showStorageSelector } from "./storage-selector";

// Authentication
export { showAuth, showVerificationMessage, type AuthMode } from "./auth";

// Master password
export { showMasterPassword, getMasterPasswordMode, type MasterPasswordMode } from "./master-password";

// Auth flow orchestrator
export {
  runAuthFlow,
  isAuthRequired,
  setupAuthListener,
  signOut,
  type AuthFlowResult,
} from "./auth-flow";

// Settings panel
export {
  showSettings,
  hideSettings,
  toggleSettings,
  type SettingsTab,
} from "./settings";

// CRUD dialogs
export { showHostEditDialog } from "./host-dialog";
export { showPasswordEditDialog } from "./password-dialog";
export { showKeyEditDialog } from "./key-dialog";
export { showTagEditDialog } from "./tag-dialog";

// Sidebar
export {
  createSidebar,
  toggleSidebar,
  showSidebar,
  hideSidebar,
  refreshSidebar,
  setConnectedHost,
  getSidebarElement,
  type SidebarOptions,
} from "./sidebar";

// Tab bar for multi-terminal
export {
  initTabBar,
  renderTabBar,
  setActiveTab,
  destroyTabBar,
  type TabBarOptions,
} from "./tabs";

// Emoji picker
export {
  showEmojiPicker,
  hideEmojiPicker,
  toggleEmojiPicker,
  isEmojiPickerOpen,
  type EmojiPickerOptions,
} from "./emoji-picker";

// Shortcuts help
export {
  showShortcutsHelp,
  hideShortcutsHelp,
  toggleShortcutsHelp,
  isShortcutsHelpOpen,
} from "./shortcuts-help";
