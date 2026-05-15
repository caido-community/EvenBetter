export const downloadFile = (name: string, content: string) => {
  const a = document.createElement("a");
  a.href = `data:application/json;charset=utf-8,${encodeURIComponent(content)}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

export const importFile = (
  accept: string,
  onFileRead: (content: string) => void,
) => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.style.display = "none";

  input.addEventListener("change", (event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || !target.files.length) return;

    const file = target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const target = e.target as FileReader;
      const content = target.result as string;
      onFileRead(content);
    };
    reader.readAsText(file);
  });

  document.body.prepend(input);
  input.click();
  input.remove();
};
