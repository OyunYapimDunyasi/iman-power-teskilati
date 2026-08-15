import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, child, set } from "firebase/database";
import { IgApiClient } from "instagram-private-api";

// ==========================================
// 1. FIREBASE VERİTABANI YAPILANDIRMASI
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyBIBexaQBvIxkqoBvXxZKouVmQoXHeb6y0",
  authDomain: "berobaba.firebaseapp.com",
  databaseURL: "https://berobaba-default-rtdb.firebaseio.com",
  projectId: "berobaba",
  storageBucket: "berobaba.firebasestorage.app",
  messagingSenderId: "112619415131",
  appId: "1:112619415131:web:a186328a2f89dcd866017e",
  measurementId: "G-R4H8CH06S3"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// 2. KENDİ YAPAY ZEKA YANIT MOTORUMUZ (AI ENGINE)
// ==========================================
const aiBrain = {
  greetings: ["selam", "merhaba", "sa", "s.a", "hey", "mrb"],
  questions: ["nasıl", "ne zaman", "neden", "nerede", "kim", "kaç", "?", "bilgi"],
  positive: ["harika", "güzel", "efsane", "süper", "kralsın", "mükemmel", "adam", "adamsın", "takip", "destek"],
  thanks: ["teşekkür", "eyvallah", "sağol", "thx", "tsk"],

  templates: {
    greeting: [
      "Selamlar! Hoş geldin ⚽",
      "Merhaba, değerli yorumun için teşekkürler! 🔥",
      "Selam! Sayfamıza katkın için sağ ol 🙌"
    ],
    question: [
      "Detaylar ve güncel analizler için takipte kalmayı unutma! 📊",
      "Bu konuyla ilgili tüm güncel gelişmeleri paylaşmaya devam edeceğiz 🚀",
      "Güzel soru! Yakında bu konu hakkında detaylı bir paylaşım gelebilir 👀"
    ],
    positive: [
      "Çok teşekkürler, desteğin bizim için çok değerli! 💪🔥",
      "Eyvallah dostum, harika paylaşımlara devam edeceğiz! ⚡",
      "Adamsın! Sayfayı takipte kal, bomba içerikler yolda 🚀"
    ],
    thanks: [
      "Rica ederim, her zaman! 🙌",
      "Ne demek, keyifli seyirler ve iyi takiple! 🔥",
      "Eyvallah, adamsın! 👍"
    ],
    default: [
      "Yorumun ve desteğin için teşekkürler! ⚽🔥",
      "Değerli görüşün için sağ ol, takipte kal! 🚀",
      "Görüşlerin bizim için önemli, harikasın! 💪"
    ]
  }
};

// Diziden rastgele eleman seçici
function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Kendi AI Yanıt Üretici Fonksiyonumuz
function customAIGenerateReply(userComment) {
  const text = userComment.toLowerCase().trim();

  let category = "default";

  if (aiBrain.greetings.some(word => text.includes(word))) {
    category = "greeting";
  } else if (aiBrain.questions.some(word => text.includes(word))) {
    category = "question";
  } else if (aiBrain.positive.some(word => text.includes(word))) {
    category = "positive";
  } else if (aiBrain.thanks.some(word => text.includes(word))) {
    category = "thanks";
  }

  return getRandomItem(aiBrain.templates[category]);
}

// ==========================================
// 3. INSTAGRAM VE KUYRUK YÖNETİMİ
// ==========================================
const ig = new IgApiClient();

// Yorumun daha önce yanıtlanıp yanıtlanmadığını Firebase'den kontrol etme
async function isCommentReplied(commentId) {
  const dbRef = ref(db);
  const snapshot = await get(child(dbRef, `replied_comments/${commentId}`));
  return snapshot.exists();
}

// Yanıtlanan yorumu Firebase'e kaydetme
async function markCommentAsReplied(commentId, commentText, replyText) {
  await set(ref(db, `replied_comments/${commentId}`), {
    text: commentText,
    reply: replyText,
    timestamp: new Date().toISOString()
  });
}

// 30 sn - 1 dk arasında rastgele gecikmeyle yorum gönderme
function scheduleReply(commentId, mediaId, commentText) {
  // 30.000 ms (30sn) ile 60.000 ms (1dk) arasında rastgele gecikme
  const delayMs = Math.floor(Math.random() * (60000 - 30000 + 1)) + 30000;

  console.log(`[+] Yorum algılandı: "${commentText}"`);
  console.log(`[⏱] Yanıt ${Math.round(delayMs / 1000)} saniye sonra gönderilecek...`);

  setTimeout(async () => {
    try {
      // 1. Kendi AI motorumuzla yanıt üret
      const aiReply = customAIGenerateReply(commentText);
      console.log(`[🤖 AI Yanıtı]: ${aiReply}`);

      // 2. Instagram'a yanıt at
      await ig.media.comment({
        mediaId: mediaId,
        text: aiReply,
        replyToCommentId: commentId
      });

      // 3. Veritabanına kaydet
      await markCommentAsReplied(commentId, commentText, aiReply);
      console.log(`[✔] Yanıt başarıyla Instagram'a gönderildi ve Firebase'e kaydedildi!\n`);

    } catch (error) {
      console.error(`[X] Yorum gönderilirken hata oluştu:`, error.message);
    }
  }, delayMs);
}

// ==========================================
// 4. ANA DÖNGÜ VE KONTROL
// ==========================================
async function checkNewComments() {
  try {
    // Son gönderileri al
    const userFeed = ig.feed.user(ig.state.cookieUserId);
    const posts = await userFeed.items();

    if (posts.length === 0) return;

    // En son paylaşılan gönderiyi kontrol et
    const latestPost = posts[0];
    const commentsFeed = ig.feed.mediaComments(latestPost.id);
    const commentsResponse = await commentsFeed.items();

    for (const comment of commentsResponse) {
      const alreadyReplied = await isCommentReplied(comment.pk);

      if (!alreadyReplied) {
        // Mükerrer zamanlama olmaması için hemen veritabanına taslak olarak işaretle
        await markCommentAsReplied(comment.pk, comment.text, "PENDING");
        
        // Zamanlayıcıya ekle
        scheduleReply(comment.pk, latestPost.id, comment.text);
      }
    }
  } catch (error) {
    console.error("[X] Kontrol sırasında hata:", error.message);
  }
}

// Uygulamayı Başlatma
async function startBot() {
  // Instagram Kullanıcı Adı ve Şifren
  ig.state.generateDevice("INSTAGRAM_KULLANICI_ADI");
  await ig.account.login("INSTAGRAM_KULLANICI_ADI", "INSTAGRAM_SIFRESI");
  console.log("[➔] Instagram hesabına başarıyla giriş yapıldı.");

  // Her 2 dakikada bir yeni yorumları denetle
  setInterval(checkNewComments, 2 * 60 * 1000);
  
  // İlk çalıştırma
  checkNewComments();
}

startBot();
