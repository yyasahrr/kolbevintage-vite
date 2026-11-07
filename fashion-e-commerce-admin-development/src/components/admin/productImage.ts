export function readProductImage(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024 || !file.size) {
    return Promise.reject(new Error("فایل JPEG، PNG یا WebP تا ۸ مگابایت انتخاب کنید."));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("خواندن فایل تصویر ناموفق بود."));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}
