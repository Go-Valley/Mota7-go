export const DELIVERY_CATEGORY = {
    id: "transportation-delivery",
    nameAr: "خدمات النقل و التوصيل",
    nameEn: "Transportation & Delivery",
    icon: "car",
    type: "delivery", // نوع مختلف لتمييزه عن المنتجات
    active: true,
    order: 1,
    items: [
      {
        id: "private-car",
        nameAr: "ملاكي",
        nameEn: "Private Car",
        icon: "car",
        active: true,
        order: 1,
        value: "private-car"
      },
      {
        id: "taxi",
        nameAr: "تاكسي",
        nameEn: "Taxi",
        icon: "car",
        active: true,
        order: 2,
        value: "taxi"
      },
      {
        id: "delivery",
        nameAr: "دليڤري",
        nameEn: "Delivery",
        icon: "bicycle",
        active: true,
        order: 3,
        value: "delivery"
      },
      {
        id: "tricycle",
        nameAr: "تروسيكل",
        nameEn: "Tricycle",
        icon: "bicycle",
        active: true,
        order: 4,
        value: "tricycle"
      },
      {
        id: "motorcycle",
        nameAr: "موتوسيكل",
        nameEn: "Motorcycle",
        icon: "bicycle",
        active: true,
        order: 5,
        value: "motorcycle"
      },
      {
        id: "quarter-transport",
        nameAr: "ربع نقل",
        nameEn: "Quarter Transport",
        icon: "car",
        active: true,
        order: 6,
        value: "quarter-transport"
      },
      {
        id: "half-transport",
        nameAr: "نص نقل",
        nameEn: "Half Transport",
        icon: "car",
        active: true,
        order: 7,
        value: "half-transport"
      },
      {
        id: "microbus",
        nameAr: "ميكروباص",
        nameEn: "Microbus",
        icon: "bus",
        active: true,
        order: 8,
        value: "microbus"
      },
      {
        id: "loader",
        nameAr: "لودر",
        nameEn: "Loader",
        icon: "car",
        active: true,
        order: 9,
        value: "loader"
      },
      {
        id: "agricultural-tractor",
        nameAr: "جرار زراعي",
        nameEn: "Agricultural Tractor",
        icon: "car",
        active: true,
        order: 10,
        value: "agricultural-tractor"
      }
    ]
  };