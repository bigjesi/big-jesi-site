export default async function handler(req, res) {
  try {
    const channelId = "UCYPM1qFmrvpP2T_8GFOa0JA";


    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`
    );


    const xml = await response.text();


    return res.status(200).json({
      status: response.status,
      channelId,
      foundVideoId: xml.includes("<yt:videoId>"),
      preview: xml.slice(0, 500)
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}