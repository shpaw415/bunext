

export default function SessionPage() {
    return (
        <div>
            <p>This page is dedicated to Testing Session Management.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button onClick={() => ServerStartSession()}>Start Session</button>
                <button onClick={() => ServerEndSession()}>End Session</button>
                <button onClick={() => ServerCheckSession()}>Check Session</button>
                <button onClick={() => ServerSetExpiration()}>Set expiration</button>
            </div>
        </div>
    );
}

export async function ServerStartSession() {
    console.log("Starting session...");
    Bunext.session.get(arguments).setData({
        active: true
    }, true);
}

export async function ServerEndSession() {
    return Bunext.session.get(arguments).delete();
}

export async function ServerCheckSession() {
    const session = Bunext.session.get(arguments);
    const data = await session.getData();
    return data;
}

export async function ServerSetExpiration() {
    const session = Bunext.session.get(arguments);
    session.setExpiration(3600); // Set expiration to 1 hour
    return { message: "Session expiration set to 1 hour." };
}