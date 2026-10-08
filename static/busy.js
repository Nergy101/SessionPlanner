// Progressive enhancement: forms marked data-busy show the logo loader while the
// request is in flight. Without this script the forms still submit normally.
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form instanceof HTMLFormElement && form.hasAttribute("data-busy")) {
    form.setAttribute("aria-busy", "true");
  }
});
