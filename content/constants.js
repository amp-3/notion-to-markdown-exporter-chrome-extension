const NotionExporterConstants = (() => {
  return Object.freeze({
    RESOURCES_DIR: "_resources",
    VIDEO_EXTENSIONS: Object.freeze([
      ".mp4", ".mov", ".mkv", ".avi", ".webm", ".wmv",
      ".mpg", ".mpeg", ".m4v", ".flv", ".3gp", ".3g2",
      ".ts", ".m2ts", ".mts", ".vob", ".ogv", ".asf",
      ".rm", ".rmvb", ".mxf",
    ]),
  });
})();
