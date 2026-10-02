import '@shopify/ui-extensions/preact';
import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

// Thank-you page upsell: for the products just bought, finds the first one with an upsell picked
// on its Shopify admin page (custom.upsell_product, a product_reference, + optional
// custom.upsell_message) and shows that product with a link to its page. Read via the Storefront
// API, so both metafield definitions need Storefronts access turned on. Renders nothing when no bought
// product has an upsell, or the upsell is sold out / already in this order / not on the Online Store.
export default function extension() {
  render(<Extension />, document.body);
}

const UPSELLS_QUERY = `
  query LelaUpsells($ids: [ID!]!) {
    nodes(ids: $ids) {
      ... on Product {
        id
        upsell: metafield(namespace: "custom", key: "upsell_product") {
          reference {
            ... on Product {
              id
              title
              onlineStoreUrl
              availableForSale
              featuredImage { url altText }
              priceRange { minVariantPrice { amount currencyCode } }
            }
          }
        }
        upsellMessage: metafield(namespace: "custom", key: "upsell_message") { value }
      }
    }
  }
`;

function Extension() {
  const [offer, setOffer] = useState(null);

  useEffect(() => {
    const boughtIds = [
      ...new Set(
        shopify.lines.value
          .map((line) => line.merchandise?.product?.id)
          .filter(Boolean),
      ),
    ];
    if (boughtIds.length === 0) return;

    shopify
      .query(UPSELLS_QUERY, {variables: {ids: boughtIds}})
      .then(({data, errors}) => {
        if (errors?.length) console.error('[lela-upsell]', errors);
        const match = (data?.nodes ?? []).find((node) => {
          const upsell = node?.upsell?.reference;
          return (
            upsell &&
            upsell.availableForSale &&
            upsell.onlineStoreUrl &&
            !boughtIds.includes(upsell.id)
          );
        });
        if (match) {
          setOffer({
            product: match.upsell.reference,
            message: match.upsellMessage?.value || 'You might also like',
          });
        }
      })
      .catch((err) => console.error('[lela-upsell]', err));
  }, []);

  if (!offer) return null;

  const {product, message} = offer;
  const price = product.priceRange.minVariantPrice;
  return (
    <s-section heading={message}>
      <s-stack direction="inline" gap="base" alignItems="center">
        {product.featuredImage && (
          <s-product-thumbnail
            src={product.featuredImage.url}
            alt={product.featuredImage.altText || product.title}
          />
        )}
        <s-stack gap="small-200">
          <s-text type="strong">{product.title}</s-text>
          <s-text>
            {shopify.i18n.formatCurrency(Number(price.amount), {
              currency: price.currencyCode,
            })}
          </s-text>
          <s-button href={product.onlineStoreUrl}>Shop now</s-button>
        </s-stack>
      </s-stack>
    </s-section>
  );
}
