

export default function ServerActionPage() {
    return <main>
        <h1>Server Action Page</h1>
        <form action={(form) => ServerSendFile(form).then((file) => file.text()).then((text) => console.log(text))}>
            <input name="props" type="hidden" value={1} />
            <button type="submit">File</button>

        </form>
    </main>
}

export async function ServerSendFile(formData: FormData) {
    console.log(formData);
    return Bun.file("static/test 1.txt") as Blob
}