// Progressive enhancement: a form marked data-require="<field name>" keeps its
// submit buttons disabled until that field has input. With
// data-require-value="<text>" the field must equal that text instead. Without
// this script the buttons stay enabled and the server does the checking.
(() => {
  const ready = (form) => {
    const field = form.elements.namedItem(form.dataset.require);
    if (!field || !("value" in field)) return true;
    const value = field.value.trim();
    const wanted = form.dataset.requireValue;
    return wanted === undefined ? value !== "" : value === wanted;
  };

  const sync = (form) => {
    const ok = ready(form);
    for (const button of form.querySelectorAll("button[type='submit']")) {
      button.disabled = !ok;
    }
  };

  const syncFrom = (event) => {
    const form = event.target?.form;
    if (form?.hasAttribute("data-require")) sync(form);
  };

  document.addEventListener("input", syncFrom);
  document.addEventListener("change", syncFrom);
  const init = () =>
    document.querySelectorAll("form[data-require]").forEach(sync);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
