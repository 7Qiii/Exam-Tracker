export async function uploadMistakeImage(file, mistakeId, authToken) {
  const response = await fetch("/api/r2-upload", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${authToken}`
    },
    body: JSON.stringify({
      mistakeId,
      fileName: file.name,
      contentType: file.type,
      size: file.size
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const upload = await response.json();
  const putResponse = await fetch(upload.uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": file.type
    },
    body: file
  });

  if (!putResponse.ok) {
    throw new Error("图片上传到 R2 失败");
  }

  return upload;
}
