function dateTime(value = new Date().toISOString()) {
  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

window.SignMeUpUtils = { dateTime };