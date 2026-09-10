import path from "node:path";

// Taro 编译配置。平台差异只允许出现在此文件与 src/platform/。
export default {
  projectName: "chinese-miniapp",
  sourceRoot: "src",
  outputRoot: "dist",
  framework: "react",
  compiler: "webpack5",
  mini: {
    compile: {
      include: [
        path.resolve(__dirname, "../../../packages"),
        path.resolve(__dirname, "../../../content"),
      ],
    },
    webpackChain(chain) {
      chain.resolve.modules
        .add(path.resolve(__dirname, "../node_modules"))
        .add("node_modules");
    },
  },
  h5: {
    compile: {
      include: [
        path.resolve(__dirname, "../../../packages"),
        path.resolve(__dirname, "../../../content"),
      ],
    },
    webpackChain(chain) {
      chain.resolve.modules
        .add(path.resolve(__dirname, "../node_modules"))
        .add("node_modules");
    },
  },
  plugins: [],
};
