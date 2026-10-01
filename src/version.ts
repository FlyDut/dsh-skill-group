/**
 * 插件自身的版本号，从 package.json 读取一次。单独立文件是因为
 * catalog / config 路由都要用它（面板标题旁的 vX.Y.Z），而它跟
 * 「去 GitHub 查最新 release」那套更新检查已经没有关系了。
 */
export const CURRENT_VERSION = (require('../package.json') as { version: string }).version
